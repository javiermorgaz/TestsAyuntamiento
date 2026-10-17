# Contrato de la API SQLite

La publicación utiliza el proveedor SQLite con la dirección de servicio configurada para su entorno, sin credenciales privadas incorporadas al build. El acceso es público y compartido, sin códigos ni cuentas. Todos los dispositivos leen y escriben en la misma SQLite. Los valores reales de conexión se conservan en la configuración privada.

La API Python permanece detrás de HTTPS y devuelve `Cache-Control: no-store`. CORS permite solo los orígenes configurados; no es un control de identidad. El modo opcional `token` conserva el acceso por dispositivo de la primera preparación; sigue siendo el valor predeterminado del servidor para no abrir inadvertidamente instalaciones anteriores. En ese modo las rutas de datos requieren `Authorization: Bearer <token>`.

## Rutas y respuestas

- `GET /health`: comprobación mínima, sin datos ni secretos.
- `GET /api/tests`: array de catálogo, columnas originales.
- `GET /api/progress`: array de resultados activos, por ID descendente; excluye borrados.
- `GET /api/progress?test_id=N`: el mismo array filtrado. El cliente elige el primer resultado para reanudar.
- `GET /api/progress/N`: resultado activo individual; un borrado conocido devuelve 410.
- `GET /api/history?test_id=N&limit=M`: array de resultados `completed`, conservando la semántica anterior; límite máximo 100.
- `POST /api/progress`: crea un resultado; requiere `operation_id`, `test_id`, `answers_data`, `total_questions`. Opcionalmente `total_correct` y `score_percentage`. Sigue siendo `in_progress`, incluso al evaluar. Si ya existe un intento activo de ese tema, rechaza con 409 y `current`, evitando duplicar intentos desde dos dispositivos. No se crea una restricción que invalide los datos históricos importados.
- `PUT /api/progress/N`: actualiza respuestas y, si vienen, puntuaciones. Requiere `operation_id` y `revision` original. No cambia `test_id`. Sin puntuaciones conserva los campos actuales.
- `DELETE /api/progress/N`: cuerpo JSON con `operation_id` y `revision`; borrado lógico e incremento de revisión. Devuelve `{ "deleted": true, "id": N }`.

Las mutaciones de creación/actualización devuelven el resultado completo, incluido `id` y `revision`. `answers_data` es un array JSON. No se exponen columnas internas de autenticación. Los resultados incorporan `created_at` y `updated_at`; las fechas antiguas importadas quedan nulas y nunca se inventan.

Los errores usan `{ "error": "codigo", "message": "texto", "current": objetoOpcional }`. HTTP 400 para datos inválidos; 401 para token ausente, inválido o revocado cuando se utiliza el modo `token`; 404 para recurso inexistente; 409 para revisión o intento en conflicto; 410 para resultado borrado; 413 para cuerpo demasiado grande; 503 para bloqueo temporal de SQLite. Un error nunca se convierte en escritura aparentemente sincronizada.

## Garantías

`operation_id` es un UUID estable de cliente. Identificador, huella de ruta/cuerpo/dispositivo y respuesta se guardan en la misma transacción que la mutación. Un reintento idéntico devuelve esa respuesta; un identificador reutilizado con datos distintos se rechaza. Los IDs numéricos se preservan y no se reutilizan. Cada mutación valida y compara la revisión original de forma atómica; el archivo no se comparte por red.

El modo público utiliza un actor interno compartido para mantener las relaciones de idempotencia; no representa una cuenta ni contiene una clave utilizable. Permite recuperar la respuesta de una operación idéntica emitida en el modo anterior, sin duplicar la escritura al retirar la autenticación. Sigue rechazando el mismo UUID con otro contenido.

La cola del navegador conserva operación e intento originales, sobrevive recarga y se separa del almacenamiento Supabase. Serializa operaciones por intento y reconoce los IDs locales de creaciones pendientes. Un nuevo autoguardado de la misma sesión puede depender del anterior, pero no se sustituye la revisión de una operación rechazada por la revisión del servidor. Tras conflicto/borrado se detienen las operaciones de ese intento y se conservan las respuestas locales para exportar o comparar. En modo público no se leen ni envían los tokens guardados anteriormente; los borradores se conservan y la pantalla normal no muestra controles de acceso o sincronización.

## Administración y coexistencia

La API no crea silenciosamente una base si falta la esperada. El esquema importado recibe una actualización explícita e idempotente para tablas de dispositivos, idempotencia, fechas y borrados. Tokens de alta entropía se almacenan como hashes y son revocables. Copias con la API SQLite, verificación de integridad y exportación del contenido permiten ensayar restauración y volver a conciliar los datos con Supabase.

Los scripts de despliegue se limitan al usuario, servicio y rutas de Tests Ayuntamiento definidos en `VPS_ISOLATION.md`. No modifican OpenClaw ni publican automáticamente el frontend de GitHub Pages. Los accesos administrativos, dominio y destino final de copias se confirman antes de ejecutar la instalación remota.
