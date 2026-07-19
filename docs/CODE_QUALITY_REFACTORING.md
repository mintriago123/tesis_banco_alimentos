# Calidad de Código y Refactorización

## Estado Actual

Este documento resume el estado real del código en la rama `refactoring_clean_code` después del refactor incremental de seguridad, pruebas, servicios críticos y frontend por rol.

- Stack validado localmente: Next.js 16.x, React 19, TypeScript 5, Tailwind CSS 4, Supabase.
- Comandos verificados: `pnpm lint`, `pnpm build` y `pnpm test` pasan correctamente.
- Tamaño aproximado de `src`: 339 archivos y 50k líneas.
- Páginas App Router: 43 páginas; 35 usan `'use client'`.
- Pruebas automatizadas: Vitest + React Testing Library, con tests de autorización, API route administrativa, casos de uso de solicitudes y componente compartido de configuración.

## Arquitectura Real

La arquitectura actual es un **monolito modular con capas**:

- `src/app`: rutas, páginas, layouts, API routes y componentes globales.
- `src/modules`: lógica agrupada por rol o dominio (`admin`, `donante`, `operador`, `user`, `auth`, `shared`).
- `src/lib`: clientes Supabase, email, comprobantes, validaciones y utilidades globales.
- `database`: scripts SQL, funciones, triggers y políticas RLS.

El proyecto no implementa Clean Architecture estricta. Los servicios de aplicación siguen dependiendo de Supabase, email, QR y notificaciones, pero el flujo crítico de solicitudes ya separa fachada, casos de uso, inventario, movimientos y notificaciones. Esto mejora la testabilidad sin introducir una reescritura completa.

## Cambios Implementados

### 1. Seguridad en API Routes

`src/app/api/admin/usuarios/route.ts` usa `SUPABASE_SERVICE_ROLE_KEY` mediante `createAdminSupabaseClient`, pero ahora valida sesión, perfil activo y rol `ADMINISTRADOR` dentro del handler antes de ejecutar operaciones privilegiadas. El mismo patrón se extendió a APIs operativas y de comprobantes.

Estado: resuelto para `/api/admin/usuarios`, `/api/admin/cancelaciones-donaciones`, APIs de bajas/alertas de operador, comprobantes y proxies de consulta de identidad.

Cambios aplicados:

- `src/lib/server-auth.ts` centraliza `getAuthenticatedUser`, `getActiveUserProfile`, `requireRole`, `requireActiveUserRole` y validaciones de roles/estados.
- `PATCH` usa whitelist explícita de campos editables.
- Campos fuera de whitelist devuelven `400`.
- Usuarios sin sesión reciben `401`.
- Usuarios activos sin rol admin reciben `403`.
- APIs de operador exigen `ADMINISTRADOR` u `OPERADOR` activo.
- APIs de cédula/RUC exigen sesión autenticada sin exigir perfil completo.

### 2. Servicios con Demasiadas Responsabilidades

`src/modules/admin/reportes/solicitudes/services/solicitudesActionService.ts` quedó como fachada compatible. La lógica se separó en módulos internos:

- `use-cases/approveSolicitud.ts`
- `use-cases/rejectSolicitud.ts`
- `use-cases/deliverSolicitud.ts`
- `use-cases/revertSolicitud.ts`
- `use-cases/processPartialDelivery.ts`
- `solicitudesInventoryService.ts`
- `solicitudesMovementService.ts`
- `solicitudesNotificationService.ts`

Estado: resuelto para solicitudes.

### 3. Consistencia Transaccional en Inventario

Las solicitudes aprobadas y entregas parciales validan stock, descuentan inventario, actualizan estado y registran movimientos en una unidad coordinada desde la capa de aplicación. Si falla la actualización de estado o el movimiento, el servicio restaura inventario y revierte el estado de la solicitud.

Estado: mitigado para solicitudes.

Decisiones documentadas:

- Donaciones: la base de datos gobierna inventario mediante trigger.
- Bajas: la RPC `dar_baja_producto()` gobierna la unidad transaccional.
- Solicitudes: la capa de aplicación gobierna el flujo con compensación explícita.

Ver [DATABASE.md](./DATABASE.md).

### 4. Base de Pruebas Automatizadas

Se agregó Vitest + React Testing Library.

Scripts:

- `pnpm test`
- `pnpm test:watch`

Cobertura inicial:

- Helpers de autorización y whitelist.
- `PATCH`/`POST /api/admin/usuarios` con mocks.
- Autorización de APIs operativas y proxies de consulta de identidad.
- Casos de uso de solicitudes: aprobación, rechazo, entrega y entrega parcial.
- Componente compartido `UserSettingsContent`.

### 5. Frontend Client-Heavy

El proyecto sigue teniendo mayoría de páginas cliente, pero se redujo el número de páginas con `'use client'` de 41 a 35. Las páginas de perfil y configuración compartida ahora son Server Components que renderizan islas cliente.

Estado: mejora parcial.

### 6. Duplicación por Rol

Se extrajo `UserProfilePageContent` para perfiles de `admin`, `operador`, `donante` y `user`. También se formalizó `UserSettingsContent({ variant })` para configuración común de donante y solicitante.

Estado: resuelto para perfil y configuración común.

### 7. Código Comentado y Compatibilidad Legacy

`donationActionService.ts` ya no conserva los bloques comentados de integración manual de inventario. La decisión se documentó en `docs/DATABASE.md`.

Estado: resuelto.

## Pendientes Recomendados

1. Agregar más tests de negocio para donaciones e inventario operativo.
2. Evaluar una RPC SQL transaccional para aprobación de solicitudes si el flujo requiere garantías más estrictas que la compensación de aplicación.
3. Migrar dashboards y reportes de solo lectura a Server Components con islas cliente para filtros/modales.
4. Mantener documentación actualizada después de cada refactor funcional.

La propuesta formal de ejecución está en [PROPUESTA_REFACTOR_CLEAN_CODE.md](./PROPUESTA_REFACTOR_CLEAN_CODE.md).

## Criterio de Clean Code

El código actual tiene una estructura modular más segura y testeable que la línea base. Los flujos de solicitudes ya no concentran responsabilidades críticas en un único archivo, las API routes administrativas tienen autorización server-side y existe una red mínima de pruebas. Todavía conviene continuar con migraciones pequeñas en donaciones, reportes y páginas client-heavy.
