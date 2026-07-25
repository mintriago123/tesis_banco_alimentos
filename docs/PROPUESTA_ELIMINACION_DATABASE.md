# Propuesta de eliminación de `database/`

**Fecha:** 2026-07-23  
**Estado:** Ejecutada

## Decisión

Eliminar el directorio `database/` porque contiene scripts SQL legacy que ya no
forman parte del flujo oficial de instalación ni de ejecución del proyecto.

La fuente única para crear o actualizar la base de datos será
`supabase/migrations/`, cuyos archivos se ejecutan en orden ascendente por
nombre.

## Alcance

Se eliminaron:

- Los 11 scripts SQL históricos de `database/`.
- `database/README.md`.

No se eliminó `supabase/migrations/`, porque contiene el esquema vigente,
semillas, políticas RLS, funciones, triggers y cambios de seguridad del sistema.

## Motivo

- `database/` duplicaba parcialmente las migraciones oficiales.
- El directorio podía inducir a ejecutar scripts desactualizados o en un orden
  incorrecto.
- La documentación del proyecto ya identificaba `supabase/migrations/` como la
  fuente oficial.
- El código contenía mensajes que referenciaban un script inexistente dentro de
  `database/`.

## Cambios complementarios

- Se actualizaron README y documentación técnica para eliminar referencias a
  `database/`.
- Se actualizó el generador del diagrama de arquitectura.
- Se reemplazaron los mensajes de error que indicaban ejecutar scripts legacy.

## Impacto y migración

Las instalaciones nuevas deben ejecutar las migraciones de
`supabase/migrations/` en orden ascendente. Quien conserve una base creada con
los scripts legacy debe respaldarla y validar su estado antes de aplicar nuevas
migraciones.

## Verificación

La eliminación no afecta imports, rutas ni endpoints de Next.js. Después del
cambio deben ejecutarse:

```bash
pnpm lint
pnpm test
pnpm build
```

La reversión es posible restaurando los archivos eliminados desde Git, aunque
no se recomienda volver a usar `database/` como fuente de instalación.
