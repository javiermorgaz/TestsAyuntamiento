-- Database Schema Documentation
-- This file serves as the "Source of Truth" for the application's database structure.
-- It matches the column names expected by the application code (supabase-service.js).

-- Table: tests
-- Static catalog of tests
CREATE TABLE IF NOT EXISTS tests (
    id SERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    preguntas JSONB NOT NULL, -- Array of question objects
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: results
-- User progress and completion results
CREATE TABLE IF NOT EXISTS results (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests(id),
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
    answers_data JSONB, -- Array of user answers (simple array of values)
    total_questions INTEGER,
    total_correct INTEGER,
    score_percentage NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
