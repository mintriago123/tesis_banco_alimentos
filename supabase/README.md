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
14. `20260719044120_add_notificaciones_to_realtime_publication.sql`
15. `20260719153938_security_production_hardening.sql`
16. `20260722125034_add_donacion_cancellation_audit.sql`
17. `20260723140000_redesign_unit_conversions.sql`
18. `20260723215505_donor_warehouses_and_inventory_entries.sql`
19. `20260723230419_security_hardening_inventory_functions.sql`
20. `20260724024710_redesign_notificaciones_estado_usuario.sql`
21. `20260724052004_fix_ambiguous_nombre_bodega.sql`
22. `20260724054609_remove_legacy_deposito_principal.sql`
23. `20260724061740_harden_security_definer_rpcs.sql`
24. `20260724062623_remove_category_placeholder_functions.sql`

Para consultar qué migraciones ya recibió el proyecto vinculado:

```bash
env SUPABASE_TELEMETRY_DISABLED=1 supabase migration list --linked
```

## Notas

- El seed oficial incluye catalogo base, unidades, conversiones y depositos
  iniciales.
- No se crean usuarios de prueba. Los perfiles se crean mediante Supabase Auth y
  el trigger `public.handle_new_user()`.
- Para usuarios `ADMINISTRADOR` u `OPERADOR`, usa el endpoint admin del proyecto
  o un flujo server-side con `service_role`.
- `supabase/migrations/` es la única fuente SQL versionada para nuevas
  instalaciones y actualizaciones de la base de datos.
