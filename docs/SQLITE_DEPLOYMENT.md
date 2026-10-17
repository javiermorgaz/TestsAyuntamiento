# Despliegue de SQLite

GitHub Pages sirve los archivos estáticos del frontend. El progreso se consulta
y guarda mediante una API independiente, respaldada por SQLite.

## Configuración

El workflow selecciona el proveedor SQLite y el acceso público compartido.
La dirección del servicio se obtiene de la configuración privada de GitHub Actions.
Los valores reales de cada instalación no se documentan en el repositorio.

Para el desarrollo local, utilizar una copia privada del archivo de ejemplo
SQLite y completar la configuración del entorno correspondiente.

## Separación del servicio

La API, sus datos y sus respaldos utilizan una cuenta de sistema y directorios
propios. Compartir un servidor no implica compartir los directorios de otra
aplicación. Los recursos físicos del servidor sí son comunes.

Los archivos de la base no se publican como recursos estáticos. La API debe
ejecutarse detrás de HTTPS y aceptar los orígenes configurados para el frontend.

## Instalación y mantenimiento

Las herramientas de `scripts/` y `deploy/` validan los paquetes y los archivos
esperados antes de modificar una instalación. Los manuales con comandos, destinos,
huellas y comprobaciones de una instalación concreta se conservan de forma privada.

La configuración real debe revisarse antes de ejecutar cualquier instalador.
La actualización del frontend no requiere reemplazar la base de datos.

## Respaldos y recuperación

El servicio mantiene copias de seguridad independientes del frontend.
Las copias completas se verifican mediante las comprobaciones de integridad y
relaciones de SQLite, y mediante una restauración de prueba.

No se cambia de proveedor después de nuevas escrituras sin conciliar primero
los datos del destino actual. El proveedor anterior se conserva pausado durante
la validación; su eliminación no es automática.
