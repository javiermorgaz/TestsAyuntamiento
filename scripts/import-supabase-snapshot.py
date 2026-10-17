#!/usr/bin/env python3
"""Importa y verifica una instantánea privada. No conecta ni escribe en Supabase."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3


COLUMNS = {
    "tests": ("id", "titulo", "fichero", "num_preguntas"),
    "results": ("id", "test_id", "status", "answers_data", "total_questions",
                "total_correct", "score_percentage"),
}
SCHEMA = Path(__file__).resolve().parents[1] / "db" / "sqlite-schema.sql"


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False)


def logical_data(snapshot):
    return {table: sorted(snapshot[table], key=lambda row: row["id"])
            for table in COLUMNS}


def read_database(connection):
    connection.row_factory = sqlite3.Row
    data = {}
    for table, columns in COLUMNS.items():
        rows = [dict(row) for row in connection.execute(
            f"SELECT {', '.join(columns)} FROM {table} ORDER BY id")]
        if table == "results":
            for row in rows:
                row["answers_data"] = json.loads(row["answers_data"])
        data[table] = rows
    return data


def import_snapshot(snapshot, database):
    if snapshot.get("format_version") != 1:
        raise ValueError("Formato de instantánea no compatible")
    for table, columns in COLUMNS.items():
        if not isinstance(snapshot.get(table), list):
            raise ValueError(f"Falta la lista {table}")
        for row in snapshot[table]:
            if not isinstance(row, dict) or set(row) != set(columns):
                raise ValueError(f"El esquema de {table} ha cambiado; revisar antes de importar")
            if type(row["id"]) is not int:
                raise ValueError(f"ID no entero en {table}")
            if table == "results" and not isinstance(row["answers_data"], list):
                raise ValueError("answers_data debe ser un array")

    expected = logical_data(snapshot)
    expected_hash = hashlib.sha256(canonical(expected).encode("utf-8")).hexdigest()
    database = Path(database)
    # Creación exclusiva: nunca reemplazar una base ya existente.
    descriptor = os.open(database, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    connection = None
    try:
        connection = sqlite3.connect(database)
        connection.executescript(SCHEMA.read_text(encoding="utf-8"))
        with connection:
            for table, columns in COLUMNS.items():
                placeholders = ", ".join("?" for _ in columns)
                sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"
                for row in expected[table]:
                    values = [canonical(row[column]) if column == "answers_data"
                              else row[column] for column in columns]
                    connection.execute(sql, values)
            if connection.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("Relaciones inconsistentes")
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Integridad SQLite incorrecta")
            actual = read_database(connection)
            if actual != expected:
                raise ValueError("El contenido importado no coincide con la instantánea")
            # Verificar también el hash tras leer y decodificar los arrays JSON.
            actual_hash = hashlib.sha256(canonical(actual).encode("utf-8")).hexdigest()
            # SQLite NUMERIC normaliza 100.0 a 100: igualdad de valores es lo relevante.
            metadata = {"exported_at": str(snapshot.get("exported_at", "")),
                        "source_sha256": expected_hash, "sqlite_sha256": actual_hash}
            connection.executemany("INSERT INTO migration_metadata VALUES (?, ?)", metadata.items())
        return {"tests": len(actual["tests"]), "results": len(actual["results"]),
                "verified": True, **metadata}
    except Exception:
        if connection:
            connection.close()
            connection = None
        database.unlink()
        raise
    finally:
        if connection:
            connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    print(json.dumps(import_snapshot(snapshot, args.database), ensure_ascii=False))


if __name__ == "__main__":
    main()
