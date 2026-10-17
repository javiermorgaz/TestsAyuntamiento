"""Acceso a una base existente; administración explícita y copias coherentes."""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time


SCHEMA_VERSION = "1"
ORIGINAL_COLUMNS = {
    "tests": ("id", "titulo", "fichero", "num_preguntas"),
    "results": ("id", "test_id", "status", "answers_data", "total_questions",
                "total_correct", "score_percentage"),
}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False)


def connect(database, timeout=2.0, readonly=False):
    """mode=rw impide que una ruta equivocada cree silenciosamente otra base."""
    uri = Path(database).resolve().as_uri() + ("?mode=ro" if readonly else "?mode=rw")
    connection = sqlite3.connect(uri, uri=True, timeout=timeout, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def assert_ready(connection):
    marker = connection.execute(
        "SELECT value FROM migration_metadata WHERE key = 'api_schema_version'").fetchone()
    if marker is None or marker[0] != SCHEMA_VERSION:
        raise ValueError("Ejecuta server.manage migrate antes de iniciar la API")
    if connection.execute("PRAGMA journal_mode").fetchone()[0] != "delete":
        raise ValueError("La API requiere journal_mode=DELETE; revisar la base antes de iniciar")


def migrate(database):
    connection = connect(database)
    try:
        # Solo la administración cambia el modo, nunca una petición de usuario.
        mode = connection.execute("PRAGMA journal_mode=DELETE").fetchone()[0]
        if mode != "delete":
            raise ValueError("No se pudo configurar el diario de SQLite")
        connection.execute("BEGIN IMMEDIATE")
        version = connection.execute(
            "SELECT value FROM migration_metadata WHERE key = 'api_schema_version'").fetchone()
        if version is not None and version[0] != SCHEMA_VERSION:
            raise ValueError("Versión de API incompatible; no se rebaja el esquema")
        for table, required in ORIGINAL_COLUMNS.items():
            columns = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
            if not set(required).issubset(columns):
                raise ValueError(f"Esquema importado incompatible: {table}")
        columns = {row[1] for row in connection.execute("PRAGMA table_info(results)")}
        if "revision" not in columns:
            raise ValueError("La base no contiene el esquema de importación con revision")
        for column in ("created_at", "updated_at", "deleted_at"):
            if column not in columns:
                connection.execute(f"ALTER TABLE results ADD COLUMN {column} TEXT")
        connection.execute("""CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            revoked_at TEXT
        )""")
        connection.execute("""CREATE TABLE IF NOT EXISTS operations (
            operation_id TEXT PRIMARY KEY,
            device_id INTEGER NOT NULL REFERENCES devices(id),
            fingerprint TEXT NOT NULL,
            response_status INTEGER NOT NULL,
            response_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )""")
        connection.execute("CREATE INDEX IF NOT EXISTS results_active ON results(test_id, deleted_at, id DESC)")
        connection.execute("INSERT OR REPLACE INTO migration_metadata(key, value) VALUES ('api_schema_version', ?)",
                           (SCHEMA_VERSION,))
        if connection.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Relaciones inconsistentes")
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Integridad SQLite incorrecta")
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def public_actor(connection):
    """Actor estable para operaciones compartidas; el marcador nunca es una credencial."""
    marker = "!public-actor-v1!"
    connection.execute("BEGIN IMMEDIATE")
    try:
        connection.execute("INSERT OR IGNORE INTO devices(name, token_hash, created_at) VALUES (?, ?, ?)",
                           ("Acceso público", marker, utc_now()))
        actor = connection.execute("SELECT id FROM devices WHERE token_hash = ?", (marker,)).fetchone()[0]
        connection.commit()
        return actor
    except Exception:
        connection.rollback()
        raise


def create_device(database, name):
    if not isinstance(name, str) or not name.strip() or len(name) > 100:
        raise ValueError("Nombre de dispositivo vacío o demasiado largo")
    token = secrets.token_urlsafe(32)
    connection = connect(database)
    try:
        assert_ready(connection)
        cursor = connection.execute(
            "INSERT INTO devices(name, token_hash, created_at) VALUES (?, ?, ?)",
            (name.strip(), token_hash(token), utc_now()))
        return {"id": cursor.lastrowid, "name": name.strip(), "token": token}
    finally:
        connection.close()


def revoke_device(database, device_id):
    connection = connect(database)
    try:
        assert_ready(connection)
        cursor = connection.execute("UPDATE devices SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?",
                                    (utc_now(), device_id))
        if cursor.rowcount != 1:
            raise ValueError("Dispositivo inexistente")
    finally:
        connection.close()


def backup(database, destination):
    destination = Path(destination)
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(descriptor)
    source = target = None
    try:
        source = connect(database, readonly=True)
        target = sqlite3.connect(destination)
        deadline = time.monotonic() + 30

        def progress(status, remaining, total):
            if time.monotonic() > deadline:
                raise TimeoutError("La copia excedió 30 segundos; reintentar cuando la base esté disponible")

        source.backup(target, pages=128, progress=progress, sleep=0.05)
        if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("La copia no supera la comprobación de integridad")
        if target.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("La copia contiene relaciones inconsistentes")
    except Exception:
        if target:
            target.close()
            target = None
        destination.unlink()
        raise
    finally:
        if source:
            source.close()
        if target:
            target.close()


def export_snapshot(database):
    """Exportación compatible con el importador; los borrados no se resucitan."""
    connection = connect(database)
    try:
        connection.execute("BEGIN")
        snapshot = {"format_version": 1, "exported_at": utc_now()}
        result_columns = {row[1] for row in connection.execute("PRAGMA table_info(results)")}
        for table, columns in ORIGINAL_COLUMNS.items():
            condition = " WHERE deleted_at IS NULL" if table == "results" and "deleted_at" in result_columns else ""
            rows = [dict(row) for row in connection.execute(
                f"SELECT {', '.join(columns)} FROM {table}{condition} ORDER BY id")]
            if table == "results":
                for row in rows:
                    row["answers_data"] = json.loads(row["answers_data"])
            snapshot[table] = rows
        return snapshot
    finally:
        connection.close()
