# Calidad de Código y Refactorización

## Estado Actual

Este documento resume el estado real del código al momento del análisis en la rama `refactoring_clean_code`.

- Stack validado localmente: Next.js 16.x, React 19, TypeScript 5, Tailwind CSS 4, Supabase.
- Comandos verificados: `pnpm lint` y `pnpm build` pasan correctamente.
- Tamaño aproximado de `src`: 339 archivos y 50k líneas.
- Páginas App Router: 43 páginas; 41 usan `'use client'`.
- No existe script `pnpm test` ni suite automatizada detectada.

## Arquitectura Real

La arquitectura actual es un **monolito modular con capas**:

- `src/app`: rutas, páginas, layouts, API routes y componentes globales.
- `src/modules`: lógica agrupada por rol o dominio (`admin`, `donante`, `operador`, `user`, `auth`, `shared`).
- `src/lib`: clientes Supabase, email, comprobantes, validaciones y utilidades globales.
- `database`: scripts SQL, funciones, triggers y políticas RLS.

El proyecto no implementa Clean Architecture estricta. Los servicios de aplicación dependen directamente de Supabase, email, QR, notificaciones y lógica de inventario. Esto es aceptable para el estado actual, pero limita testabilidad y aumenta el riesgo al cambiar flujos críticos.

## Hallazgos Principales

### 1. Seguridad en API Routes

`src/app/api/admin/usuarios/route.ts` usa `SUPABASE_SERVICE_ROLE_KEY` mediante `createAdminSupabaseClient`, pero el handler actual no valida sesión ni rol antes de crear o modificar usuarios. El proxy protege rutas de página como `/admin`, pero no cubre automáticamente `/api/admin/*`.

Prioridad: alta.

Acción recomendada:

- Validar usuario autenticado dentro del endpoint.
- Exigir rol `ADMINISTRADOR` y estado `activo`.
- Definir una lista explícita de campos modificables para `PATCH`.
- Evitar aceptar `updates` arbitrario desde el cliente.

### 2. Servicios con Demasiadas Responsabilidades

`src/modules/admin/reportes/solicitudes/services/solicitudesActionService.ts` concentra aprobación, rechazo, entrega, reversión, validación de stock, descuento de inventario, movimientos, comprobantes, QR, emails y notificaciones.

Prioridad: alta.

Acción recomendada:

- Separar casos de uso por archivo: aprobar solicitud, rechazar solicitud, entregar solicitud, revertir solicitud y procesar entrega parcial.
- Extraer servicios específicos para inventario, comprobantes y notificaciones.
- Mantener una fachada compatible para no romper hooks y páginas de golpe.

### 3. Riesgo Transaccional en Inventario

Algunos flujos actualizan la solicitud y después descuentan inventario o registran movimientos en pasos separados. Si falla una operación intermedia, la base puede quedar en estado parcial.

Prioridad: alta.

Acción recomendada:

- Mover operaciones críticas a funciones SQL/RPC transaccionales o a handlers server-side que coordinen una única unidad de trabajo.
- Agregar pruebas de caracterización antes de cambiar estos flujos.

### 4. Frontend Client-Heavy

La documentación anterior decía que el proyecto usaba Server Components por defecto. El código actual usa `'use client'` en casi todas las páginas.

Prioridad: media.

Acción recomendada:

- Mantener Client Components para formularios, modales, filtros, mapas y estados locales.
- Migrar páginas de lectura o dashboards simples a Server Components cuando no requieran eventos del navegador.
- Bajar la frontera client-side a componentes interactivos específicos.

### 5. Duplicación por Rol

Hay páginas de perfil y configuración con lógica similar entre `admin`, `donante`, `operador` y `user`.

Prioridad: media.

Acción recomendada:

- Crear componentes compartidos para perfil, cambio de contraseña y preferencias.
- Mantener wrappers por rol solo para títulos, permisos y navegación.

### 6. Código Comentado y Compatibilidad Legacy

`donationActionService.ts` conserva bloques grandes de lógica desactivada porque el inventario pasó a manejarse por triggers de base de datos.

Prioridad: media.

Acción recomendada:

- Eliminar código comentado y documentar la decisión en este archivo o en `docs/DATABASE.md`.
- Mantener solo la lógica activa y los comentarios que expliquen decisiones vigentes.

## Plan de Refactor Recomendado

1. Corregir seguridad de API routes con service role.
2. Agregar pruebas mínimas para usuarios, solicitudes, donaciones e inventario.
3. Extraer lógica de inventario y conversión de unidades desde servicios grandes.
4. Separar casos de uso de solicitudes y donaciones.
5. Reducir duplicación de páginas por rol.
6. Migrar gradualmente páginas de lectura a Server Components.
7. Actualizar documentación después de cada refactor funcional.

La propuesta formal de ejecución está en [PROPUESTA_REFACTOR_CLEAN_CODE.md](./PROPUESTA_REFACTOR_CLEAN_CODE.md).

## Criterio de Clean Code

El código actual tiene una estructura modular razonable, pero todavía no cumple completamente con Clean Code en los flujos críticos porque hay archivos grandes, mezcla de responsabilidades, código comentado y ausencia de pruebas. La recomendación es aplicar refactor incremental, no una reescritura completa.
