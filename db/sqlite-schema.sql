-- Esquema experimental basado en las tablas REALES revisadas el 2026-10-12.
-- Las preguntas siguen en public/data; la base guarda catálogo y respuestas.
PRAGMA foreign_keys = ON;

CREATE TABLE tests (
    id INTEGER PRIMARY KEY,
    titulo TEXT NOT NULL,
    fichero TEXT NOT NULL,
    num_preguntas INTEGER NOT NULL
);

CREATE TABLE results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL REFERENCES tests(id),
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
    answers_data TEXT NOT NULL CHECK (json_valid(answers_data)),
    total_questions INTEGER,
    total_correct INTEGER,
    score_percentage NUMERIC,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE INDEX results_test_latest ON results(test_id, id DESC);

CREATE TABLE migration_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
