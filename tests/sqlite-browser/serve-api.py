"""Servidor público desechable para pruebas: ningún dato de producción."""

from pathlib import Path
import json
import sqlite3
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from server import database
from server.app import Config, APIServer


def main():
    with tempfile.TemporaryDirectory(prefix="tests-sqlite-browser-") as directory:
        db = Path(directory) / "browser.sqlite"
        connection = sqlite3.connect(db)
        connection.executescript((ROOT / "db/sqlite-schema.sql").read_text())
        catalogs = json.loads((ROOT / "public/data/tests_index.json").read_text())[:2]
        for catalog in catalogs:
            connection.execute("INSERT INTO tests VALUES (?, ?, ?, ?)", (
                catalog["id"], catalog["titulo"], catalog["fichero"], catalog["num_preguntas"]))
        catalog = catalogs[0]
        connection.execute("INSERT INTO results(id, test_id, status, answers_data, total_questions) VALUES (91, 1, 'in_progress', ?, ?)", (
            json.dumps([None] * catalog["num_preguntas"]), catalog["num_preguntas"]))
        connection.commit()
        connection.close()
        database.migrate(db)
        server = APIServer(("127.0.0.1", 8766), Config(db, ("http://127.0.0.1:5175",), access_mode="public"))
        try:
            server.serve_forever()
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
