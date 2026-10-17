"""Verificación real de SQLite, incluida edición concurrente desde dos conexiones."""

from concurrent.futures import ThreadPoolExecutor
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

spec = importlib.util.spec_from_file_location(
    "migration", Path(__file__).resolve().parents[1] / "scripts/import-supabase-snapshot.py")
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


def snapshot():
    return {"format_version": 1, "exported_at": "2026-10-12T12:00:00Z",
            "tests": [{"id": 1, "titulo": "Constitución", "fichero": "tests/tema1.json",
                       "num_preguntas": 2}],
            "results": [{"id": 91, "test_id": 1, "status": "in_progress",
                         "answers_data": ["A", None], "total_questions": 2,
                         "total_correct": None, "score_percentage": None}]}


class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database = Path(self.directory.name) / "test.sqlite"

    def test_preserves_values_and_next_id(self):
        original = snapshot()
        report = migration.import_snapshot(original, self.database)
        self.assertTrue(report["verified"])
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(migration.read_database(connection), migration.logical_data(original))
            cursor = connection.execute(
                "INSERT INTO results(test_id,status,answers_data) VALUES (1,'in_progress','[]')")
            self.assertEqual(cursor.lastrowid, 92)

    def test_refuses_overwrite(self):
        migration.import_snapshot(snapshot(), self.database)
        before = self.database.read_bytes()
        with self.assertRaises(FileExistsError):
            migration.import_snapshot(snapshot(), self.database)
        self.assertEqual(self.database.read_bytes(), before)

    def test_rejects_orphan_without_leaving_partial_database(self):
        original = snapshot()
        original["results"][0]["test_id"] = 99
        with self.assertRaises(sqlite3.IntegrityError):
            migration.import_snapshot(original, self.database)
        self.assertFalse(self.database.exists())

    def test_rejects_schema_drift(self):
        original = snapshot()
        original["results"][0]["new_column"] = "must not disappear"
        with self.assertRaises(ValueError):
            migration.import_snapshot(original, self.database)
        self.assertFalse(self.database.exists())

    def test_two_clients_cannot_overwrite_same_revision(self):
        migration.import_snapshot(snapshot(), self.database)
        barrier = threading.Barrier(2)

        def save(answer):
            with sqlite3.connect(self.database, timeout=5) as connection:
                revision = connection.execute("SELECT revision FROM results WHERE id=91").fetchone()[0]
                barrier.wait(timeout=5)
                return connection.execute(
                    "UPDATE results SET answers_data=?, revision=revision+1 WHERE id=? AND revision=?",
                    (migration.canonical([answer, None]), 91, revision)).rowcount

        with ThreadPoolExecutor(max_workers=2) as clients:
            outcomes = list(clients.map(save, ["B", "C"]))
        self.assertEqual(sorted(outcomes), [0, 1])
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(connection.execute("SELECT revision FROM results WHERE id=91").fetchone()[0], 2)


if __name__ == "__main__":
    unittest.main()
