#!/usr/bin/env python3
"""Prepara accesos privados y una copia transferible, sin modificar respuestas."""

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import sqlite3
import ssl
import stat
import sys
import tempfile
from urllib import error, request


API_URL = "https://46.224.88.8"
FRONTEND_ORIGIN = "https://javiermorgaz.github.io"
CODE = Path("/opt/tests-ayuntamiento")
DATABASE = Path("/var/lib/tests-ayuntamiento/tests-ayuntamiento.sqlite")
CONFIG = Path("/etc/tests-ayuntamiento")
BACKUPS = Path("/var/backups/tests-ayuntamiento")
INITIAL = Path("/tmp/tests-ayuntamiento-migracion-20261012-01/initial.sqlite")
ENROLLMENTS = (("enrollment-mac.json", "Prueba Mac"),
               ("enrollment-movil.json", "Prueba móvil"))


class AccessError(Exception):
    """Los mensajes de error nunca incorporan claves, filas ni respuestas HTTP."""


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False)


def sha256(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def no_links(path):
    if not path.is_absolute():
        raise AccessError("Se requiere una ruta absoluta")
    for entry in (path, *path.parents):
        if entry.is_symlink():
            raise AccessError("No se permiten enlaces simbólicos en las rutas de preparación")


def verify_path(path, owner, mode, directory=False, group=None):
    no_links(path)
    info = path.lstat()
    valid_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if (not valid_type or info.st_uid != owner or stat.S_IMODE(info.st_mode) != mode
            or (group is not None and info.st_gid != group)):
        raise AccessError("Propietario, tipo o permisos inesperados: " + str(path))


@dataclass(frozen=True)
class Layout:
    database: Path = DATABASE
    config: Path = CONFIG
    backups: Path = BACKUPS
    initial: Path = INITIAL


def preflight(layout):
    if sys.platform != "linux" or os.geteuid() != 0:
        raise AccessError("Ejecuta este preparador con sudo en el VPS Linux")
    service = pwd.getpwnam("tests-ayuntamiento")
    transfer_user = pwd.getpwnam("denver")
    if service.pw_uid == 0 or transfer_user.pw_uid == 0:
        raise AccessError("Las cuentas de servicio y transferencia no deben ser root")
    verify_path(CODE, 0, 0o755, directory=True, group=0)
    verify_path(CODE / "server", 0, 0o755, directory=True, group=0)
    for name in ("__init__.py", "database.py"):
        verify_path(CODE / "server" / name, 0, 0o644, group=0)
    verify_path(layout.config, 0, 0o750, directory=True, group=service.pw_gid)
    verify_path(layout.config / "api.env", 0, 0o640, group=service.pw_gid)
    verify_path(layout.database.parent, service.pw_uid, 0o700, directory=True, group=service.pw_gid)
    verify_path(layout.database, service.pw_uid, 0o600, group=service.pw_gid)
    verify_path(layout.backups, 0, 0o700, directory=True, group=0)
    no_links(layout.initial)
    initial_owner = layout.initial.lstat().st_uid
    if initial_owner not in (0, transfer_user.pw_uid):
        raise AccessError("La instantánea inicial debe pertenecer a root o denver")
    verify_path(layout.initial.parent, initial_owner, 0o700, directory=True)
    verify_path(layout.initial, initial_owner, 0o600)
    for filename, _ in ENROLLMENTS:
        path = layout.config / filename
        if path.exists() or path.is_symlink():
            verify_path(path, 0, 0o600, group=0)
    return transfer_user


def installed_database_module():
    # Se importa exclusivamente el módulo instalado y protegido por root.
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("tests_ayuntamiento_database", CODE / "server/database.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_state(path, module, ready=False):
    """Una transacción de solo lectura incluye todos los valores, sin filtrarlos."""
    connection = module.connect(path, readonly=True)
    try:
        connection.execute("BEGIN")
        if ready:
            module.assert_ready(connection)
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise AccessError("La base no supera la comprobación de integridad")
        if connection.execute("PRAGMA foreign_key_check").fetchone():
            raise AccessError("La base contiene relaciones inconsistentes")
        original = {}
        for table, columns in module.ORIGINAL_COLUMNS.items():
            rows = [dict(row) for row in connection.execute(
                f"SELECT {','.join(columns)} FROM {table} ORDER BY id")]
            if table == "results":
                for row in rows:
                    row["answers_data"] = json.loads(row["answers_data"])
            original[table] = rows
        complete = {}
        if ready:
            for table, order in (("tests", "id"), ("results", "id"), ("devices", "id"),
                                 ("operations", "operation_id"), ("migration_metadata", "key"),
                                 ("sqlite_sequence", "name")):
                complete[table] = [dict(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY {order}")]
            active = [dict(row) for row in connection.execute(
                "SELECT * FROM results WHERE status='in_progress' AND deleted_at IS NULL ORDER BY id DESC")]
            for row in active:
                row["answers_data"] = json.loads(row["answers_data"])
        else:
            active = []
        return {"original": original, "complete": complete, "active": active}
    finally:
        connection.close()


def assert_original_equal(reference, actual):
    if canonical(reference["original"]) != canonical(actual["original"]):
        raise AccessError("El contenido SQLite no coincide íntegramente con la instantánea inicial; no se sobrescribe nada")


def private_write(path, data):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def validate_enrollment(value, database, module, name):
    if (not isinstance(value, dict) or set(value) != {"id", "name", "token"}
            or type(value["id"]) is not int or value["id"] <= 0 or value["name"] != name
            or not isinstance(value["token"], str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{40,256}", value["token"])):
        raise AccessError("El archivo de acceso existente no tiene el formato esperado; se conserva")
    connection = module.connect(database, readonly=True)
    try:
        row = connection.execute("SELECT name, token_hash, revoked_at FROM devices WHERE id=?", (value["id"],)).fetchone()
        if (row is None or row["name"] != name or row["revoked_at"] is not None
                or not hmac.compare_digest(row["token_hash"], module.token_hash(value["token"]))):
            raise AccessError("El acceso existente no pertenece a esta base o está revocado; se conserva")
    finally:
        connection.close()
    return value


def enrollment(path, database, module, name, owner=0):
    if path.exists() or path.is_symlink():
        verify_path(path, owner, 0o600)
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, UnicodeError):
            raise AccessError("El archivo de acceso existente no es válido; no se reemplaza") from None
        return validate_enrollment(value, database, module, name)
    # Reserva exclusiva antes de emitir: otro proceso nunca sobrescribe esta clave.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    value = None
    try:
        with os.fdopen(descriptor, "wb") as output:
            if owner == 0:
                os.fchown(output.fileno(), 0, 0)
            value = module.create_device(database, name)
            output.write((canonical(value) + "\n").encode("utf-8"))
            output.flush()
            os.fsync(output.fileno())
        return validate_enrollment(value, database, module, name)
    except Exception:
        if value is not None:
            module.revoke_device(database, value["id"])
        path.unlink(missing_ok=True)
        raise


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class HTTPSAPI:
    def __init__(self):
        # Sin proxies heredados ni redirecciones; los tokens solo van a esta IP por TLS válido.
        self.opener = request.build_opener(request.ProxyHandler({}), NoRedirect(),
                                           request.HTTPSHandler(context=ssl.create_default_context()))

    def get(self, path, token=None, origin=None):
        if path not in ("/health", "/api/tests", "/api/progress"):
            raise AccessError("Ruta de comprobación no permitida")
        headers = {}
        if token is not None:
            headers["Authorization"] = "Bearer " + token
        if origin is not None:
            headers["Origin"] = origin
        try:
            with self.opener.open(request.Request(API_URL + path, headers=headers), timeout=15) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
                if len(raw) > 2 * 1024 * 1024:
                    raise AccessError("La respuesta HTTPS supera el tamaño previsto")
                try:
                    value = json.loads(raw)
                except (ValueError, UnicodeError):
                    raise AccessError("La API no devolvió el JSON esperado") from None
                return response.status, value, {key.lower(): value for key, value in response.headers.items()}
        except error.HTTPError as exc:
            status = exc.code
            exc.close()
            return status, None, {}
        except (error.URLError, TimeoutError, OSError):
            raise AccessError("HTTPS no disponible o certificado no válido; no se relaja TLS") from None


def expect_status(response, expected):
    if response[0] != expected:
        raise AccessError(f"La API devuelve HTTP {response[0]}; se esperaba HTTP {expected}")
    return response


def check_api(api, state, credential, module, database):
    token = credential["token"]
    for path, expected in (("/api/tests", state["original"]["tests"]),
                           ("/api/progress", state["active"])):
        response = expect_status(api.get(path, token, FRONTEND_ORIGIN), 200)
        if response[2].get("access-control-allow-origin") != FRONTEND_ORIGIN:
            raise AccessError("La API no permite exactamente el origen GitHub previsto")
        if response[2].get("cache-control") != "no-store":
            raise AccessError("La API debe impedir caché de datos privados")
        columns = module.ORIGINAL_COLUMNS["tests" if path == "/api/tests" else "results"]
        try:
            actual = [{column: row[column] for column in columns} for row in response[1]]
            wanted = [{column: row[column] for column in columns} for row in expected]
        except (TypeError, KeyError):
            raise AccessError("La API no devuelve el esquema de datos previsto") from None
        if canonical(actual) != canonical(wanted):
            raise AccessError("Los datos de la API no coinciden íntegramente con SQLite")
    expect_status(api.get("/api/tests", token, "https://origen-no-permitido.invalid"), 403)
    expect_status(api.get("/api/tests", "x" * 43), 401)
    temporary = module.create_device(database, "Comprobación efímera de revocación")
    try:
        expect_status(api.get("/api/tests", temporary["token"]), 200)
    finally:
        module.revoke_device(database, temporary["id"])
        expect_status(api.get("/api/tests", temporary["token"]), 401)


def make_transfer(backup, enrollments, owner, base=Path("/tmp")):
    directory = Path(tempfile.mkdtemp(prefix="tests-ayuntamiento-transfer-", dir=base))
    try:
        files = [(backup, "backup.sqlite"), *[(path, path.name) for path in enrollments]]
        for source, name in files:
            target = directory / name
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with source.open("rb") as original, os.fdopen(descriptor, "wb") as output:
                shutil.copyfileobj(original, output)
                output.flush()
                os.fsync(output.fileno())
            if file_hash(target) != file_hash(source):
                raise AccessError("La copia privada para transferencia no coincide")
            os.chown(target, owner.pw_uid, owner.pw_gid)
        # Publicar para denver únicamente después de completar los tres archivos.
        os.chown(directory, owner.pw_uid, owner.pw_gid)
        return directory
    except Exception:
        shutil.rmtree(directory)
        raise


def prepare(layout, module, api, transfer_user, private_owner=0, transfer_base=Path("/tmp")):
    reference = read_state(layout.initial, module)
    initial = read_state(layout.database, module, ready=True)
    assert_original_equal(reference, initial)
    if expect_status(api.get("/health"), 200)[1] != {"ok": True}:
        raise AccessError("La comprobación de salud HTTPS no devuelve el estado previsto")
    expect_status(api.get("/api/tests"), 401)
    enrollments = []
    for filename, name in ENROLLMENTS:
        path = layout.config / filename
        credential = enrollment(path, layout.database, module, name, private_owner)
        enrollments.append((path, credential))
    check_api(api, initial, enrollments[0][1], module, layout.database)
    current = read_state(layout.database, module, ready=True)
    assert_original_equal(reference, current)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = layout.backups / ("tests-ayuntamiento-" + timestamp + ".sqlite")
    module.backup(layout.database, backup)
    saved = read_state(backup, module, ready=True)
    after = read_state(layout.database, module, ready=True)
    if canonical(saved["complete"]) != canonical(current["complete"]) or canonical(after["complete"]) != canonical(current["complete"]):
        raise AccessError("La base cambió durante la copia; conservar la copia y repetir la preparación")
    assert_original_equal(reference, saved)
    directory = make_transfer(backup, [path for path, _ in enrollments], transfer_user, transfer_base)
    return {"success": True, "transfer_directory": str(directory), "backup": str(backup),
            "counts": {name: len(rows) for name, rows in saved["complete"].items()},
            "original_sha256": sha256(saved["original"]),
            "complete_sha256": sha256(saved["complete"]), "backup_sha256": file_hash(backup),
            "api_schema_version": module.SCHEMA_VERSION,
            "files": ["backup.sqlite", "enrollment-mac.json", "enrollment-movil.json"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--initial-db", type=Path, default=INITIAL)
    args = parser.parse_args()
    try:
        layout = Layout(initial=args.initial_db)
        transfer_user = preflight(layout)
        os.umask(0o077)
        module = installed_database_module()
        summary = prepare(layout, module, HTTPSAPI(), transfer_user)
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
        return 0
    except AccessError as exc:
        print("Preparación detenida: " + str(exc), file=sys.stderr)
        return 1
    except (OSError, ValueError, sqlite3.Error, KeyError):
        # Ni excepciones de terceros ni cuerpos HTTP pueden incluir tokens/filas en stdout/stderr.
        print("Preparación detenida: falló una comprobación de permisos, datos, acceso o copia. No se modificaron respuestas ni se reemplazaron claves.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
