# Manual administrativo

El rol `ADMINISTRADOR` puede gestionar configuración operativa, usuarios,
catálogo y reportes. Las APIs vuelven a validar el rol en el servidor, por lo
que ocultar una opción en pantalla no es el único control de seguridad.

## Usuarios

1. Abre `Administración > Usuarios`.
2. Filtra por rol, estado o texto de búsqueda.
3. Crea o edita el perfil con los campos permitidos.
4. Usa bloqueo temporal cuando exista una fecha y motivo definidos.
5. Desactiva una cuenta solo con autorización y revisa que el usuario ya no
   pueda operar.

## Catálogo

1. Abre `Administración > Catálogo`.
2. Revisa solicitudes de alta de alimentos.
3. Verifica nombre, categoría y unidades permitidas.
4. Aprueba o rechaza la solicitud con un comentario claro.
5. Confirma que el resultado se refleje en el catálogo y la notificación del
   solicitante.

## Reportes

Consulta reportes de solicitudes, donaciones, inventario, bajas y
cancelaciones. Aplica filtros de fechas y estado; para cada reporte revisa que
el total, el detalle y la paginación sean coherentes.

## Cancelaciones de donaciones

1. Abre el reporte de cancelaciones.
2. Filtra por motivo o periodo.
3. Revisa donante, responsable, fecha, cantidad y observaciones.
4. Si necesitas cancelar una donación, confirma que esté pendiente, selecciona
   un motivo y registra observaciones cuando corresponda.
5. Conserva el código o captura del registro para la trazabilidad académica.

## Controles de cierre

- Verifica que no existan usuarios administrativos sin responsable.
- Confirma que una baja apunte a una entrada/lote y no a un saldo agregado
  legacy.
- Ejecuta la matriz manual y registra los resultados en
  [`TESTING.md`](./TESTING.md).
