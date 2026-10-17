-- Corte reversible: conservar Supabase para lectura y recuperación.
-- Ejecutar SOLO después de exportar, conciliar y respaldar los datos finales.
-- Aplicar en una transacción y comprobar los permisos efectivos al terminar.
-- No elimina tablas, filas ni el proyecto. Solo afecta a estas dos tablas.
LOCK TABLE public.tests, public.results IN SHARE MODE;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.tests, public.results FROM anon, authenticated, PUBLIC;

DO $$
DECLARE
    app_role text;
    app_table text;
    write_privilege text;
BEGIN
    FOREACH app_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        FOREACH app_table IN ARRAY ARRAY['public.tests', 'public.results'] LOOP
            IF NOT has_table_privilege(app_role, app_table, 'SELECT') THEN
                RAISE EXCEPTION 'El corte debe conservar la lectura';
            END IF;
            FOREACH write_privilege IN ARRAY ARRAY[
                'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
            ] LOOP
                IF has_table_privilege(app_role, app_table, write_privilege) THEN
                    RAISE EXCEPTION 'Quedan permisos de escritura: %, %, %',
                        app_role, app_table, write_privilege;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- Los permisos anteriores eran los mismos para anon y authenticated:
-- SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.
-- Revertirlos SOLO tras conciliar los cambios posteriores de SQLite:
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
-- ON TABLE public.tests, public.results TO anon, authenticated;
