# Validación de Supabase

La fuente de verdad del esquema es `supabase/migrations/`. Esta guía separa
las comprobaciones locales de las que necesitan acceso al proyecto remoto.

## Preparación y migraciones

```bash
env SUPABASE_TELEMETRY_DISABLED=1 supabase migration list --linked
env SUPABASE_TELEMETRY_DISABLED=1 supabase db push --linked --dry-run
```

La lista documentada debe coincidir con los 31 archivos de
`supabase/migrations/`, incluyendo la consolidación de inventario, el flujo de
bodegas y la reparación final del trigger:

- `20260724220103_consolidate_entries_inventory_source.sql`
- `20260724222434_reuse_catalog_identity_for_entries.sql`
- `20260724222657_index_inventory_entry_foreign_keys.sql`
- `20260725015123_solicitudes_bodega_workflow.sql`
- `20260725022235_fix_ambiguous_bodega_principal.sql`
- `20260725040607_asociar_unidades_presentacion_catalogo.sql`
- `20260725051713_repair_donation_trigger_entries_source.sql`

Antes de aplicar cualquier pendiente, realiza el respaldo descrito en
[`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md). Esta entrega no aplica migraciones
remotas automáticamente.

## Consultas de integridad

Ejecuta estas consultas con un rol administrativo en la base de pruebas o en
producción durante una ventana autorizada:

```sql
-- Entradas con saldo imposible o estado incoherente
select id_entrada, cantidad_original, cantidad_disponible, estado
from public.entradas_inventario
where cantidad_original < 0
   or cantidad_disponible < 0
   or cantidad_disponible > cantidad_original
   or (cantidad_disponible = 0 and estado <> 'agotado')
   or (cantidad_disponible > 0 and estado <> 'disponible');

-- Saldos agregados por producto y depósito desde la fuente vigente
select id_producto, id_deposito, sum(cantidad_disponible) as saldo
from public.entradas_inventario
where cantidad_disponible > 0
group by id_producto, id_deposito
order by id_producto, id_deposito;

-- Las tablas públicas deben tener RLS habilitado
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- Foreign keys de las entradas y sus índices
select conname, conrelid::regclass as table_name, confrelid::regclass as referenced_table
from pg_constraint
where conrelid in ('public.entradas_inventario'::regclass,
                   'public.bajas_productos'::regclass,
                   'public.movimiento_inventario_detalle'::regclass)
  and contype = 'f';
```

En el modelo vigente, `entradas_inventario` es la única fuente de saldo. La
tabla agregada `inventario` y las columnas de saldo legacy de
`productos_donados` no deben recibir escrituras activas. Si una base anterior
a la consolidación todavía conserva `inventario`, compara sus agregados con la
consulta de entradas antes de retirar la compatibilidad.

## RLS, RPC, triggers e índices

Revisa que:

- Las tablas expuestas tengan RLS y políticas para el rol correcto.
- Las funciones `SECURITY DEFINER` estén justificadas, tengan `search_path`
  seguro y no queden ejecutables por `PUBLIC` sin autorización.
- `dar_baja_producto`, las funciones FEFO y las funciones de restauración
  trabajen con `id_entrada`.
- Los triggers de autenticación, donaciones, inventario, notificaciones y
  actualización de timestamps existan en la base de prueba.
- Los índices de las foreign keys de inventario estén presentes, en especial
  los creados por `20260724222657_index_inventory_entry_foreign_keys.sql`.

Con acceso al proyecto también se deben ejecutar:

```bash
env SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --linked --fail-on error
env SUPABASE_TELEMETRY_DISABLED=1 supabase db advisors --linked --type all --level warn
```

## Registro de esta entrega

| Comprobación | Resultado |
|--------------|-----------|
| Revisión de los 31 archivos de migración y orden ascendente | Revisado localmente |
| Revisión estática de la consolidación de inventario | Revisado localmente; incluye guardas de diferencias de saldo, fuente activa `entradas_inventario`, RLS de vistas e índices de FK |
| `supabase migration list --linked` | Pendiente: requiere `SUPABASE_ACCESS_TOKEN` |
| `supabase db lint --linked` y advisors | Pendiente: requiere acceso al proyecto remoto |
| Base local de pruebas | Pendiente: el entorno no tiene acceso al daemon Docker |
| Respaldo remoto previo a migraciones | Pendiente: debe ejecutarse con credenciales del responsable |
| Comparación de saldos en datos reales | Pendiente: requiere ejecutar SQL sobre la base autorizada |

No se marca como aplicada ninguna migración ni se afirma que exista un respaldo
cuando esas operaciones no se pudieron ejecutar en el entorno de desarrollo.
