"""Ensayos privados de preparación: sin SSH, sudo ni red real."""

import importlib.util
import io
import json
import os
from pathlib import Path
from types import SimpleNamespace
import sqlite3
import ssl
import stat
import sys
import tempfile
import unittest
from unittest import mock

from server import database


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sqlite_prepare_access", ROOT / "scripts/sqlite-prepare-access.py")
access = importlib.util.module_from_spec(spec)
spec.loader.exec_module(access)


class FakeAPI:
    def __init__(self, path):
        self.path = path
        self.revoked_checks = 0
        self.before_revocation_failure = False

    def get(self, route, token=None, origin=None):
        if route == "/health":
            return 200, {"ok": True}, {}
        if origin not in (None, access.FRONTEND_ORIGIN):
            return 403, None, {}
        connection = database.connect(self.path, readonly=True)
        try:
            device = None if token is None else connection.execute(
                "SELECT * FROM devices WHERE token_hash=?", (database.token_hash(token),)).fetchone()
            if device is None or device["revoked_at"] is not None:
                if device is not None:
                    self.revoked_checks += 1
                return 401, None, {}
            if device["name"] == "Comprobación efímera de revocación" and self.before_revocation_failure:
                return 500, None, {}
            state = access.read_state(self.path, database, ready=True)
            values = state["original"]["tests"] if route == "/api/tests" else state["active"]
            return 200, values, {"access-control-allow-origin": access.FRONTEND_ORIGIN, "cache-control": "no-store"}
        finally:
            connection.close()


class AccessPreparationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        for name in ("config", "backups", "transfer"):
            (self.root / name).mkdir(mode=0o700)
        self.db = self.root / "live.sqlite"
        self.initial = self.root / "initial.sqlite"
        connection = sqlite3.connect(self.db)
        connection.executescript((ROOT / "db/sqlite-schema.sql").read_text())
        connection.execute("INSERT INTO tests VALUES(1,'Tema privado','tema.json',3)")
        connection.execute("INSERT INTO results(id,test_id,status,answers_data,total_questions,total_correct,score_percentage) VALUES(91,1,'in_progress',?,3,1,33.33)",
                           (json.dumps([None, 0, {"response": 2}]),))
        connection.execute("INSERT INTO migration_metadata VALUES('source_sha256','original-marker')")
        connection.commit()
        connection.close()
        database.backup(self.db, self.initial)
        database.migrate(self.db)
        self.layout = access.Layout(self.db, self.root / "config", self.root / "backups", self.initial)
        self.owner = SimpleNamespace(pw_uid=os.getuid(), pw_gid=os.getgid())
        self.api = FakeAPI(self.db)

    def tearDown(self):
        self.temp.cleanup()

    def prepare(self):
        return access.prepare(self.layout, database, self.api, self.owner,
                              private_owner=os.getuid(), transfer_base=self.root / "transfer")

    def test_prepare_preserves_all_original_values_and_exports_only_three_private_files(self):
        original = access.read_state(self.initial, database)["original"]
        summary = self.prepare()
        self.assertTrue(summary["success"])
        directory = Path(summary["transfer_directory"])
        self.assertEqual(set(path.name for path in directory.iterdir()), set(summary["files"]))
        self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)
        for path in directory.iterdir():
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(path.stat().st_uid, self.owner.pw_uid)
        self.assertEqual(access.read_state(self.db, database, ready=True)["original"], original)
        saved = access.read_state(directory / "backup.sqlite", database, ready=True)
        self.assertEqual(saved["original"], original)
        self.assertEqual(len(saved["complete"]["devices"]), 3)
        self.assertEqual(summary["backup_sha256"], access.file_hash(directory / "backup.sqlite"))
        self.assertEqual(self.api.revoked_checks, 1)
        for filename, name in access.ENROLLMENTS:
            credential = json.loads((directory / filename).read_text())
            self.assertEqual(credential["name"], name)
            self.assertNotIn(credential["token"], json.dumps(summary))
            self.assertEqual((self.layout.config / filename).read_bytes(), (directory / filename).read_bytes())

    def test_partial_rerun_reuses_keys_without_overwriting_or_duplicate_real_devices(self):
        first_path = self.layout.config / access.ENROLLMENTS[0][0]
        first = access.enrollment(first_path, self.db, database, access.ENROLLMENTS[0][1], os.getuid())
        original_bytes = first_path.read_bytes()
        self.prepare()
        self.prepare()
        self.assertEqual(first_path.read_bytes(), original_bytes)
        connection = database.connect(self.db, readonly=True)
        try:
            devices = connection.execute("SELECT name FROM devices WHERE revoked_at IS NULL").fetchall()
            self.assertEqual(sorted(row[0] for row in devices), ["Prueba Mac", "Prueba móvil"])
        finally:
            connection.close()
        self.assertEqual(access.enrollment(first_path, self.db, database, first["name"], os.getuid()), first)

    def test_revoked_or_invalid_existing_enrollment_never_replaced(self):
        path = self.layout.config / access.ENROLLMENTS[0][0]
        credential = access.enrollment(path, self.db, database, access.ENROLLMENTS[0][1], os.getuid())
        before = path.read_bytes()
        database.revoke_device(self.db, credential["id"])
        with self.assertRaises(access.AccessError):
            access.enrollment(path, self.db, database, access.ENROLLMENTS[0][1], os.getuid())
        self.assertEqual(path.read_bytes(), before)
        with self.assertRaises(FileExistsError):
            access.private_write(path, b"replacement")
        self.assertEqual(path.read_bytes(), before)

    def test_data_drift_stops_before_issuing_any_device(self):
        connection = database.connect(self.db)
        connection.execute("UPDATE results SET total_correct=2 WHERE id=91")
        connection.close()
        with self.assertRaises(access.AccessError):
            self.prepare()
        connection = database.connect(self.db, readonly=True)
        try:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM devices").fetchone()[0], 0)
        finally:
            connection.close()
        self.assertEqual(list(self.layout.config.iterdir()), [])

    def test_read_snapshots_use_only_readonly_connections_and_preserve_files(self):
        original_connect = database.connect
        calls = []

        def read_connection(path, **kwargs):
            calls.append(kwargs)
            return original_connect(path, **kwargs)

        before = {path: path.read_bytes() for path in (self.initial, self.db)}
        with mock.patch.object(database, "connect", side_effect=read_connection):
            access.read_state(self.initial, database)
            access.read_state(self.db, database, ready=True)
        self.assertTrue(all(call["readonly"] is True for call in calls))
        for path, expected in before.items():
            self.assertEqual(path.read_bytes(), expected)

    def test_ephemeral_key_always_revoked_and_revocation_checked_after_api_failure(self):
        credential = access.enrollment(self.layout.config / "enrollment-mac.json", self.db,
                                       database, "Prueba Mac", os.getuid())
        self.api.before_revocation_failure = True
        with self.assertRaises(access.AccessError):
            access.check_api(self.api, access.read_state(self.db, database, ready=True), credential, database, self.db)
        self.assertEqual(self.api.revoked_checks, 1)
        connection = database.connect(self.db, readonly=True)
        try:
            row = connection.execute("SELECT revoked_at FROM devices WHERE name LIKE 'Comprobación%'").fetchone()
            self.assertIsNotNone(row[0])
        finally:
            connection.close()

    def test_permission_and_symlink_checks_reject_unsafe_secret_paths(self):
        target = self.layout.config / "private.json"
        access.private_write(target, b"{}")
        access.verify_path(target, os.getuid(), 0o600)
        target.chmod(0o644)
        with self.assertRaises(access.AccessError):
            access.verify_path(target, os.getuid(), 0o600)
        link = self.layout.config / "link.json"
        link.symlink_to(target)
        with self.assertRaises(access.AccessError):
            access.enrollment(link, self.db, database, "Prueba Mac", os.getuid())

    def test_https_transport_uses_fixed_destination_verified_tls_and_no_redirect(self):
        original_context = ssl.create_default_context
        contexts = []

        def verified_context():
            context = original_context()
            contexts.append(context)
            return context

        with mock.patch.object(access.ssl, "create_default_context", side_effect=verified_context):
            transport = access.HTTPSAPI()
        self.assertTrue(contexts[0].check_hostname)
        self.assertEqual(contexts[0].verify_mode, ssl.CERT_REQUIRED)
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b'{"ok":true}'
        response.status = 200
        response.headers = {}
        with mock.patch.object(transport.opener, "open", return_value=response) as opened:
            self.assertEqual(transport.get("/health")[0], 200)
            self.assertEqual(opened.call_args.args[0].full_url, access.API_URL + "/health")
            with self.assertRaises(access.AccessError):
                transport.get("https://otro-destino.invalid", token="never-send")
            self.assertEqual(opened.call_count, 1)
        self.assertIsNone(access.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://otro-destino.invalid"))

    def test_command_failure_never_prints_exception_secrets(self):
        output, errors = io.StringIO(), io.StringIO()
        with mock.patch.object(sys, "argv", ["sqlite-prepare-access.py"]), \
                mock.patch.object(access, "preflight", side_effect=ValueError("token-that-must-not-appear")), \
                mock.patch.object(sys, "stdout", output), mock.patch.object(sys, "stderr", errors):
            self.assertEqual(access.main(), 1)
        self.assertEqual(output.getvalue(), "")
        self.assertNotIn("token-that-must-not-appear", errors.getvalue())

    def test_command_prints_only_controlled_diagnostic_for_access_error(self):
        errors = io.StringIO()
        with mock.patch.object(sys, "argv", ["sqlite-prepare-access.py"]), \
                mock.patch.object(access, "preflight", side_effect=access.AccessError("Permisos inesperados")), \
                mock.patch.object(sys, "stderr", errors):
            self.assertEqual(access.main(), 1)
        self.assertIn("Permisos inesperados", errors.getvalue())
        with self.assertRaisesRegex(access.AccessError, "HTTP 403; se esperaba HTTP 200"):
            access.expect_status((403, None, {}), 200)


if __name__ == "__main__":
    unittest.main()
