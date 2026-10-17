# App de tests de oposiciones

Aplicación web para practicar tests, corregir respuestas y continuar el progreso desde distintos dispositivos.

## Funcionamiento

- Las preguntas se distribuyen como archivos estáticos.
- El progreso compartido se guarda en SQLite mediante una API.
- Los borradores se conservan localmente cuando no hay conexión.
- Las revisiones evitan sobrescribir cambios de otro dispositivo sin resolver el conflicto.
- La web conserva el acceso compartido sin cuentas ni códigos.

## Desarrollo

Requisitos: Node.js 24, pnpm y Python 3 para las pruebas de la API.

```sh
pnpm install
pnpm dev
```

La consola indica dónde abrir el servidor de desarrollo. La configuración de cada
entorno se proporciona mediante archivos locales excluidos de Git o mediante la
configuración privada del despliegue. Los archivos de ejemplo no contienen valores reales.

```sh
pnpm build
pnpm preview
```

## Verificación

```sh
pnpm test
pnpm test:sqlite
python3 -B -m unittest discover -s deploy -p 'test_sqlite*.py'
pnpm test:sqlite:browser
pnpm test:visual
python3 scripts/check-public-docs.py
```

Las pruebas de navegador utilizan datos de prueba y un servidor propio. Las copias
de bases de datos y las comprobaciones con datos reales permanecen fuera de Git.

## Organización

- `src/`: interfaz, lógica de tests y adaptadores de datos.
- `public/data/`: preguntas e índice de temas.
- `server/`: API SQLite.
- `db/`: esquemas y herramientas SQL.
- `deploy/` y `scripts/`: herramientas de instalación y mantenimiento.
- `tests/`: pruebas unitarias y de navegador.
- `docs/`: documentación general sin direcciones concretas ni credenciales.

El adaptador histórico de Supabase se conserva para recuperación y pruebas. La
publicación actual utiliza SQLite.

Véanse [la API](docs/SQLITE_API.md), [el despliegue](docs/SQLITE_DEPLOYMENT.md) y
[la política de documentación y secretos](docs/SECURITY.md).
