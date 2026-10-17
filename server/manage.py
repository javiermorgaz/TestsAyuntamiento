#!/usr/bin/env python3
"""Administración local: nunca obtiene credenciales ni datos desde Supabase."""

import argparse
import json
import os
from pathlib import Path
import sqlite3
import sys

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server import database


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=os.environ.get("SQLITE_DB_PATH"), type=Path)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("migrate")
    create = commands.add_parser("create-device")
    create.add_argument("--name", required=True)
    revoke = commands.add_parser("revoke-device")
    revoke.add_argument("device_id", type=int)
    commands.add_parser("backup").add_argument("destination", type=Path)
    commands.add_parser("export-snapshot").add_argument("destination", type=Path)
    args = parser.parse_args()
    if args.db is None:
        parser.error("Indica --db o SQLITE_DB_PATH")
    try:
        if args.command == "migrate":
            database.migrate(args.db)
            print(json.dumps({"migrated": True, "schema_version": database.SCHEMA_VERSION}))
        elif args.command == "create-device":
            # El token solo aparece aquí, una vez. No se guarda en claro en la base.
            print(json.dumps(database.create_device(args.db, args.name), ensure_ascii=False))
        elif args.command == "revoke-device":
            database.revoke_device(args.db, args.device_id)
            print(json.dumps({"revoked": True, "id": args.device_id}))
        elif args.command == "backup":
            database.backup(args.db, args.destination)
            print(json.dumps({"backup": str(args.destination), "verified": True}))
        else:
            snapshot = database.export_snapshot(args.db)
            with open(args.destination, "x", encoding="utf-8", opener=lambda path, flags: os.open(path, flags, 0o600)) as output:
                json.dump(snapshot, output, ensure_ascii=False, allow_nan=False)
                output.write("\n")
            print(json.dumps({"snapshot": str(args.destination), "results": len(snapshot["results"])}))
    except (ValueError, OSError, sqlite3.Error) as exc:
        print(f"No se pudo completar la administración: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
