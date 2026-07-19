# Supabase migrations

Esta carpeta es la fuente oficial para crear o reconstruir la base de datos del
proyecto.

## Orden de ejecucion

Ejecuta los archivos de `supabase/migrations/` en orden ascendente por nombre.
La secuencia actual permite levantar una base nueva desde cero:

1. `20260718000100_initial_schema.sql`
2. `20260718000200_catalog_seed.sql`
3. `20260718000300_donante_deposito_mapping.sql`
4. `20260718000400_auditoria_donante_bodega.sql`
5. `20260718000500_solicitudes_alta_alimentos.sql`
6. `20260718000600_rls_hardening.sql`
7. `20260718000700_function_privilege_hardening.sql`
8. `20260718000800_notificaciones_vista_hardening.sql`
9. `20260718000900_function_search_path_hardening.sql`
10. `20260718001000_private_auth_helpers.sql`
11. `20260718001100_revoke_anon_catalog_request_rpc.sql`
12. `20260718001200_security_cleanup_from_mcp_review.sql`
13. `20260719022558_consolidate_permissive_rls_policies.sql`

## Notas

- El seed oficial incluye catalogo base, unidades, conversiones y depositos
  iniciales.
- No se crean usuarios de prueba. Los perfiles se crean mediante Supabase Auth y
  el trigger `public.handle_new_user()`.
- Para usuarios `ADMINISTRADOR` u `OPERADOR`, usa el endpoint admin del proyecto
  o un flujo server-side con `service_role`.
- El directorio `database/` queda como referencia historica; no debe usarse como
  fuente principal para nuevas instalaciones.
