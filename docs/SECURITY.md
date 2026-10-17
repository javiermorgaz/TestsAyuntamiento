# Documentación pública y secretos

Este repositorio es público. La documentación contiene únicamente explicaciones
generales, rutas relativas y ejemplos sin valores reales.

Las direcciones concretas de la infraestructura, los manuales administrativos,
los datos exportados y las credenciales se conservan en almacenamiento local
privado o en la configuración privada del despliegue. No se añaden a Git.

La carpeta local `.migration/` está excluida de Git. Sus copias administrativas
utilizan permisos restringidos. Los archivos de entorno, las bases SQLite y las
claves privadas también están excluidos.

Una dirección utilizada por el frontend puede observarse desde el navegador.
No debe considerarse una contraseña ni utilizarse como mecanismo de autenticación.

La integración continua comprueba que los documentos públicos no incorporen
direcciones absolutas, direcciones IP ni formatos habituales de credenciales.
Esta comprobación complementa la revisión de los cambios.

Retirar un dato de la versión actual no lo elimina del historial. La retirada
del historial y la rotación de una credencial expuesta requieren actuaciones
específicas; no se reescribe el historial automáticamente.
