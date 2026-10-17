"""Contratos HTTP reales: dispositivos, conflictos, reintentos y administración."""

from concurrent.futures import ThreadPoolExecutor
import http.client
import json
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
import uuid

from server.app import APIServer, Config
from server import database


ROOT = Path(__file__).resolve().parents[1]


class SQLiteAPITest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.db = Path(self.directory.name) / "test.sqlite"
        connection = sqlite3.connect(self.db)
        connection.executescript((ROOT / "db/sqlite-schema.sql").read_text())
        connection.execute("INSERT INTO tests VALUES (1, 'Tema primero', '1.json', 3)")
        connection.execute("INSERT INTO tests VALUES (2, 'Tema segundo', '2.json', 3)")
        connection.execute("INSERT INTO results(id, test_id, status, answers_data, total_questions, total_correct, score_percentage) VALUES (91, 1, 'in_progress', '[null,0,null]', 3, 1, 33.33)")
        connection.commit()
        connection.close()
        database.migrate(self.db)
        self.device = database.create_device(self.db, "Primer dispositivo")
        self.other = database.create_device(self.db, "Segundo dispositivo")
        self.origin = "https://example.github.io"
        self.server = APIServer(("127.0.0.1", 0), Config(self.db, (self.origin,), busy_timeout=0.05))
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.directory.cleanup()

    def request(self, method, path, body=None, token="default", headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
        request_headers = {}
        if token == "default":
            token = self.device["token"]
        if token is not None:
            request_headers["Authorization"] = "Bearer " + token
        raw = None
        if body is not None:
            raw = json.dumps(body).encode() if not isinstance(body, bytes) else body
            request_headers["Content-Type"] = "application/json"
        request_headers.update(headers or {})
        try:
            connection.request(method, path, raw, request_headers)
            response = connection.getresponse()
            content = response.read()
            return response.status, json.loads(content) if content else None, dict(response.getheaders())
        finally:
            connection.close()

    def update(self, revision=1, **extra):
        return {"operation_id": str(uuid.uuid4()), "revision": revision,
                "answers_data": [0, 1, None], **extra}

    def create(self, **extra):
        return {"operation_id": str(uuid.uuid4()), "test_id": 2,
                "answers_data": [None, None, None], "total_questions": 3, **extra}

    def restart_server(self, access_mode="token"):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.server = APIServer(("127.0.0.1", 0), Config(self.db, (self.origin,), busy_timeout=0.05, access_mode=access_mode))
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()

    def test_public_anonymous_crud_revision_conflicts_and_busy_retry(self):
        self.restart_server("public")
        self.assertEqual(self.request("GET", "/api/tests", token=None)[0], 200)
        created = self.request("POST", "/api/progress", self.create(), token=None)
        self.assertEqual(created[0], 201)
        path = "/api/progress/" + str(created[1]["id"])
        self.assertEqual(self.request("GET", path, token=None)[1]["revision"], 1)
        update = self.update()
        blocker = database.connect(self.db)
        blocker.execute("BEGIN IMMEDIATE")
        try:
            self.assertEqual(self.request("PUT", path, update, token=None)[0], 503)
        finally:
            blocker.rollback()
            blocker.close()
        self.assertEqual(self.request("PUT", path, update, token=None)[1]["revision"], 2)
        stale = self.request("PUT", path, self.update(), token=None)
        self.assertEqual(stale[0], 409)
        self.assertEqual(stale[1]["current"]["revision"], 2)
        deletion = {"operation_id": str(uuid.uuid4()), "revision": 2}
        self.assertEqual(self.request("DELETE", path, deletion, token=None)[0], 200)
        self.assertEqual(self.request("GET", path, token=None)[0], 410)
        self.assertEqual(self.request("PUT", path, self.update(2), token=None)[0], 410)

    def test_public_replays_private_lost_ack_but_rejects_different_payload(self):
        operation = self.update()
        private_result = self.request("PUT", "/api/progress/91", operation)
        self.assertEqual(private_result[0], 200)
        self.restart_server("public")
        self.assertEqual(self.request("PUT", "/api/progress/91", operation, token=None)[:2], private_result[:2])
        self.assertEqual(self.request("PUT", "/api/progress/91", self.update(2), token=None)[0], 200)
        self.assertEqual(self.request("PUT", "/api/progress/91", operation, token=None)[:2], private_result[:2])
        reused = {**operation, "answers_data": [2, 2, 2]}
        self.assertEqual(self.request("PUT", "/api/progress/91", reused, token=None)[1]["error"], "operation_conflict")
        self.assertEqual(self.request("GET", "/api/progress/91", token=None)[1]["revision"], 3)

    def test_public_lost_response_does_not_duplicate_and_actor_survives_restart(self):
        self.restart_server("public")
        actor = self.server.public_actor_id
        operation = self.create()
        raw = json.dumps(operation).encode()
        with socket.create_connection(self.server.server_address, timeout=3) as connection:
            connection.sendall((f"POST /api/progress HTTP/1.0\r\nContent-Type: application/json\r\nContent-Length: {len(raw)}\r\n\r\n").encode() + raw)
            self.assertTrue(connection.recv(1))
        self.restart_server("public")
        self.assertEqual(self.server.public_actor_id, actor)
        replay = self.request("POST", "/api/progress", operation, token=None)
        self.assertEqual(replay[0], 201)
        self.assertEqual(len(self.request("GET", "/api/progress?test_id=2", token=None)[1]), 1)
        self.assertEqual(self.request("POST", "/api/progress", self.create(), token=None)[0], 409)
        connection = database.connect(self.db, readonly=True)
        try:
            actor_row = connection.execute("SELECT * FROM devices WHERE id=?", (actor,)).fetchone()
            self.assertEqual(actor_row["name"], "Acceso público")
            self.assertEqual(len(actor_row["token_hash"]), 17)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM devices WHERE token_hash=?", (actor_row["token_hash"],)).fetchone()[0], 1)
        finally:
            connection.close()

    def test_access_mode_invalid_fails_closed_and_public_keeps_exact_cors(self):
        with self.assertRaises(ValueError):
            Config(self.db, access_mode="unexpected")
        self.assertEqual(self.request("GET", "/api/tests", token=None)[0], 401)
        self.restart_server("public")
        self.assertEqual(self.request("GET", "/api/tests", token=None, headers={"Origin": self.origin + ".evil"})[0], 403)
        allowed = self.request("GET", "/api/tests", token=None, headers={"Origin": self.origin})
        self.assertEqual(allowed[0], 200)
        self.assertEqual(allowed[2]["Access-Control-Allow-Origin"], self.origin)
        self.restart_server()
        self.assertEqual(self.request("GET", "/api/tests", token=None)[0], 401)
        self.assertEqual(self.request("GET", "/api/tests", token="!public-actor-v1!")[0], 401)
        self.assertEqual(self.request("GET", "/api/tests")[0], 200)

    def test_two_devices_same_revision_only_one_saves(self):
        barrier = threading.Barrier(2)

        def write(index):
            barrier.wait()
            return self.request("PUT", "/api/progress/91", self.update(answers_data=[index, None, None]),
                                token=(self.device if index == 0 else self.other)["token"])

        with ThreadPoolExecutor(max_workers=2) as workers:
            responses = list(workers.map(write, (0, 1)))
        self.assertEqual(sorted(item[0] for item in responses), [200, 409])
        conflict = next(item[1] for item in responses if item[0] == 409)
        self.assertEqual(conflict["current"]["revision"], 2)
        self.assertEqual(self.request("GET", "/api/progress/91")[1]["revision"], 2)

    def test_retry_exact_response_and_payload_or_device_reuse_rejected(self):
        operation = self.update()
        first = self.request("PUT", "/api/progress/91", operation)
        self.assertEqual(first[0], 200)
        later = self.request("PUT", "/api/progress/91", self.update(2, answers_data=[2, 2, 2]))
        self.assertEqual(later[0], 200)
        replay = self.request("PUT", "/api/progress/91", operation)
        self.assertEqual(replay[:2], first[:2])
        self.assertEqual(self.request("GET", "/api/progress/91")[1]["revision"], 3)
        changed = {**operation, "answers_data": [1, 1, 1]}
        self.assertEqual(self.request("PUT", "/api/progress/91", changed)[1]["error"], "operation_conflict")
        self.assertEqual(self.request("PUT", "/api/progress/91", operation, token=self.other["token"])[0], 409)

    def test_lost_response_retry_does_not_duplicate_creation(self):
        body = self.create()
        raw = json.dumps(body).encode()
        with socket.create_connection(self.server.server_address, timeout=3) as connection:
            request = (f"POST /api/progress HTTP/1.0\r\nAuthorization: Bearer {self.device['token']}\r\n"
                       f"Content-Type: application/json\r\nContent-Length: {len(raw)}\r\n\r\n").encode() + raw
            connection.sendall(request)
            # Descartar la respuesta: no hay ID ni resultado disponible para el cliente.
            self.assertTrue(connection.recv(1))
        replay = self.request("POST", "/api/progress", body)
        self.assertEqual(replay[0], 201)
        self.assertEqual(replay[1]["id"], 92)
        self.assertEqual(len(self.request("GET", "/api/progress?test_id=2")[1]), 1)

    def test_two_concurrent_creations_return_current_attempt(self):
        barrier = threading.Barrier(2)

        def create(index):
            barrier.wait()
            return self.request("POST", "/api/progress", self.create(),
                                token=(self.device if index == 0 else self.other)["token"])

        with ThreadPoolExecutor(max_workers=2) as workers:
            responses = list(workers.map(create, (0, 1)))
        self.assertEqual(sorted(item[0] for item in responses), [201, 409])
        self.assertEqual(next(item[1] for item in responses if item[0] == 409)["current"]["id"], 92)

    def test_delete_tombstone_prevents_stale_resurrection_and_id_reuse(self):
        deletion = {"operation_id": str(uuid.uuid4()), "revision": 1}
        first = self.request("DELETE", "/api/progress/91", deletion)
        self.assertEqual(first[0], 200)
        self.assertEqual(self.request("DELETE", "/api/progress/91", deletion)[:2], first[:2])
        self.assertEqual(self.request("PUT", "/api/progress/91", self.update())[0], 410)
        self.assertEqual(self.request("GET", "/api/progress/91")[0], 410)
        self.assertEqual(self.request("GET", "/api/progress?test_id=1")[1], [])
        created = self.request("POST", "/api/progress", self.create(test_id=1))
        self.assertEqual(created[0], 201)
        self.assertGreater(created[1]["id"], 91)
        self.assertEqual(database.export_snapshot(self.db)["results"][0]["id"], created[1]["id"])

    def test_token_required_without_origin_and_revocation_blocks_replay(self):
        self.assertEqual(self.request("GET", "/api/tests", token=None)[0], 401)
        self.assertEqual(self.request("GET", "/api/tests", token="invalid")[0], 401)
        operation = self.update()
        self.assertEqual(self.request("PUT", "/api/progress/91", operation)[0], 200)
        database.revoke_device(self.db, self.device["id"])
        self.assertEqual(self.request("GET", "/api/tests")[0], 401)
        self.assertEqual(self.request("PUT", "/api/progress/91", operation)[0], 401)
        self.assertEqual(self.request("GET", "/api/tests", token=self.other["token"])[0], 200)
        self.assertEqual(self.request("GET", "/health", token=None)[1], {"ok": True})

    def test_cors_is_exact_and_never_replaces_authentication(self):
        allowed = self.request("GET", "/api/tests", headers={"Origin": self.origin})
        self.assertEqual(allowed[2]["Access-Control-Allow-Origin"], self.origin)
        self.assertEqual(allowed[2]["Cache-Control"], "no-store")
        denied = self.request("GET", "/api/tests", headers={"Origin": self.origin + ".evil"})
        self.assertEqual(denied[0], 403)
        self.assertNotIn("Access-Control-Allow-Origin", denied[2])
        self.assertEqual(self.request("GET", "/api/tests", token=None, headers={"Origin": self.origin})[0], 401)
        preflight = self.request("OPTIONS", "/api/progress", token=None, headers={"Origin": self.origin,
                                 "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "Authorization, Content-Type"})
        self.assertEqual(preflight[0], 204)
        self.assertEqual(self.request("OPTIONS", "/api/progress", token=None, headers={"Origin": self.origin,
                         "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "Cookie"})[0], 400)

    def test_invalid_payloads_never_change_data(self):
        cases = [self.update(revision=True), self.update(operation_id="not-a-uuid"),
                 self.update(answers_data={}), self.update(total_correct=4),
                 self.update(score_percentage=-1), self.update(score_percentage=10 ** 200),
                 self.update(test_id=2), self.update(status="completed"),
                 b'{"revision":1,"revision":2}', b'{"answers_data":[NaN]}',
                 b'{"answers_data":["\\ud800"]}']
        for body in cases:
            with self.subTest(body=type(body).__name__):
                self.assertEqual(self.request("PUT", "/api/progress/91", body)[0], 400)
        self.assertEqual(self.request("PUT", "/api/progress/91", b"x" * 262145)[0], 413)
        self.assertEqual(self.request("GET", "/api/progress?test_id=1&test_id=2")[0], 400)
        self.assertEqual(self.request("GET", "/api/history?limit=101")[0], 400)
        self.assertEqual(self.request("GET", "/api/progress/91")[1]["revision"], 1)

    def test_evaluation_remains_editable_and_optional_scores_preserved(self):
        evaluated = self.request("PUT", "/api/progress/91", self.update(total_correct=3, score_percentage=100))
        self.assertEqual(evaluated[1]["status"], "in_progress")
        edited = self.request("PUT", "/api/progress/91", self.update(2))
        self.assertEqual(edited[1]["total_correct"], 3)
        self.assertEqual(edited[1]["score_percentage"], 100)
        self.assertIsNone(edited[1]["created_at"])
        self.assertIsNotNone(edited[1]["updated_at"])
        self.assertEqual(self.request("GET", "/api/history?test_id=1")[1], [])

    def test_busy_database_returns_retryable_503_without_partial_operation(self):
        blocker = database.connect(self.db)
        blocker.execute("BEGIN IMMEDIATE")
        operation = self.update()
        try:
            response = self.request("PUT", "/api/progress/91", operation)
            self.assertEqual(response[0], 503)
            self.assertEqual(response[2]["Retry-After"], "1")
            self.assertEqual(blocker.execute("SELECT COUNT(*) FROM operations").fetchone()[0], 0)
        finally:
            blocker.rollback()
            blocker.close()
        self.assertEqual(self.request("PUT", "/api/progress/91", operation)[0], 200)

    def test_migrate_is_idempotent_and_backup_restores_auth_and_original_data(self):
        original = database.export_snapshot(self.db)
        database.migrate(self.db)
        self.assertEqual(database.export_snapshot(self.db)["results"], original["results"])
        destination = Path(self.directory.name) / "backup.sqlite"
        database.backup(self.db, destination)
        with self.assertRaises(FileExistsError):
            database.backup(self.db, destination)
        restored = database.connect(destination)
        try:
            database.assert_ready(restored)
            self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(restored.execute("SELECT COUNT(*) FROM devices").fetchone()[0], 2)
            self.assertNotIn(self.device["token"], destination.read_bytes().decode("latin-1"))
        finally:
            restored.close()
        self.assertEqual(database.export_snapshot(destination)["results"], original["results"])

    def test_operation_persistence_failure_rolls_back_mutation(self):
        connection = database.connect(self.db)
        connection.execute("CREATE TRIGGER reject_operation BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT, 'forced failure'); END")
        try:
            operation = self.update()
            self.assertEqual(self.request("PUT", "/api/progress/91", operation)[0], 500)
            current = self.request("GET", "/api/progress/91")[1]
            self.assertEqual(current["revision"], 1)
            self.assertEqual(current["answers_data"], [None, 0, None])
            connection.execute("DROP TRIGGER reject_operation")
            self.assertEqual(self.request("PUT", "/api/progress/91", operation)[0], 200)
        finally:
            connection.close()

    def test_admin_cli_export_refuses_overwrite_and_device_revokes(self):
        def admin(*args):
            return subprocess.run([sys.executable, "-m", "server.manage", "--db", str(self.db), *args],
                                  cwd=ROOT, text=True, capture_output=True, check=False)

        created = admin("create-device", "--name", "Dispositivo CLI")
        self.assertEqual(created.returncode, 0)
        device = json.loads(created.stdout)
        self.assertEqual(self.request("GET", "/api/tests", token=device["token"])[0], 200)
        self.assertEqual(admin("revoke-device", str(device["id"])).returncode, 0)
        self.assertEqual(self.request("GET", "/api/tests", token=device["token"])[0], 401)
        destination = Path(self.directory.name) / "export.json"
        self.assertEqual(admin("export-snapshot", str(destination)).returncode, 0)
        snapshot = json.loads(destination.read_text())
        self.assertEqual(snapshot["format_version"], 1)
        self.assertEqual(set(snapshot["results"][0]), set(database.ORIGINAL_COLUMNS["results"]))
        self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
        before = destination.read_bytes()
        self.assertEqual(admin("export-snapshot", str(destination)).returncode, 1)
        self.assertEqual(destination.read_bytes(), before)
        backup = Path(self.directory.name) / "cli-backup.sqlite"
        self.assertEqual(admin("backup", str(backup)).returncode, 0)
        self.assertEqual(admin("backup", str(backup)).returncode, 1)

    def test_missing_database_never_created_and_unmigrated_server_refuses_start(self):
        missing = Path(self.directory.name) / "missing.sqlite"
        with self.assertRaises(sqlite3.OperationalError):
            database.migrate(missing)
        self.assertFalse(missing.exists())
        unmigrated = Path(self.directory.name) / "unmigrated.sqlite"
        connection = sqlite3.connect(unmigrated)
        connection.executescript((ROOT / "db/sqlite-schema.sql").read_text())
        connection.close()
        with self.assertRaises(ValueError):
            APIServer(("127.0.0.1", 0), Config(unmigrated))


if __name__ == "__main__":
    unittest.main()
