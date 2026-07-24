# Matriz de requisitos y evidencia

Esta matriz complementa el archivo `docs/Matriz_Requerimientos_Actualizada.xlsx`
con referencias verificables en el código y en la validación manual.

| ID | Requisito | Módulo o ruta | Evidencia automatizada | Evidencia manual |
|----|-----------|---------------|------------------------|------------------|
| RF-01 | Autenticar usuarios y separar roles | `src/modules/auth`, `src/lib/server-auth.ts` | Tests de auth y autorización de API | ADM/DON/SOL/OPE-01 |
| RF-02 | Gestionar usuarios administrativos | `/api/admin/usuarios` | `src/app/api/admin/usuarios/route.test.ts` | ADM-01 |
| RF-03 | Registrar y seguir donaciones | Módulo `donante/donaciones` | Tests de creación, edición y cancelación | DON-02, DON-03 |
| RF-04 | Gestionar solicitudes de alimentos | `admin/reportes/solicitudes`, `user/solicitudes` | Tests de casos de uso de solicitudes | SOL-01, SOL-02, OPE-01, OPE-02 |
| RF-05 | Administrar catálogo | `/api/admin/catalogo-solicitudes` | Test de aprobación de catálogo | ADM-02 |
| RF-06 | Consultar inventario por entrada/lote | `entradas_inventario`, reportes de inventario | Tests de unidades, FEFO y errores de consulta | OPE-01, OPE-03 |
| RF-07 | Registrar bajas y alertas de vencimiento | `/api/operador/bajas` | Tests de baja, estadísticas y alertas | OPE-04 |
| RF-08 | Generar comprobantes | `/api/comprobante/[codigo]` | Test de autorización y respuesta | OPE-05, SOL-03 |
| RF-09 | Enviar notificaciones | `modules/shared/services` | Tests de eventos, persistencia y enlaces | ADM-02, SOL-02 |
| RF-10 | Consultar identidad ecuatoriana | `/api/proxy/consultar-ruc`, `/consultar-cedula` | Tests de validación, HTTPS y rate limit | DON-01 |
| RNF-01 | Proteger datos con RLS y autorización server-side | Migraciones Supabase y API routes | Revisión SQL + tests `401/403` | Todos los roles |
| RNF-02 | Desplegar en Vercel con secretos protegidos | `docs/DEPLOYMENT_VERCEL.md` | `pnpm build` y revisión estática | Checklist post-despliegue |

El archivo XLSX se mantiene como artefacto de presentación; esta versión
Markdown facilita revisar la trazabilidad durante el desarrollo y la defensa.
