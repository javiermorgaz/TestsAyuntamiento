-- Solo lectura. Una sentencia obtiene una instantánea coherente de ambas tablas.
-- Guardar el TEXTO de la columna snapshot en .migration/supabase-snapshot.json.
-- No incluir este resultado en Git, public/ ni dist/.
SELECT jsonb_build_object(
    'format_version', 1,
    'exported_at', clock_timestamp(),
    'tests', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.tests t), '[]'::jsonb),
    'results', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.results r), '[]'::jsonb)
)::text AS snapshot;
