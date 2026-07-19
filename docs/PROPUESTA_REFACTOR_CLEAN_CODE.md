# Propuesta de Refactorización y Clean Code

## 1. Resumen Ejecutivo

Se propone ejecutar una refactorización incremental del sistema Banco de Alimentos ULEAM para mejorar seguridad, mantenibilidad, testabilidad y consistencia arquitectónica sin reescribir la aplicación completa.

El proyecto ya tiene una base modular funcional: Next.js 16, React 19, TypeScript, Supabase, módulos por rol y documentación técnica. Sin embargo, el análisis actual detectó riesgos en API routes sensibles, servicios con demasiadas responsabilidades, operaciones de inventario con riesgo transaccional, uso predominante de Client Components, duplicación por rol y ausencia de pruebas automatizadas.

La propuesta prioriza primero los riesgos de mayor impacto y deja las mejoras estructurales para fases controladas.

## Estado de Ejecución

Estado actualizado: refactor incremental ejecutado en la rama `refactoring_clean_code`.

- Fase 1 completada: las APIs sensibles intervenidas validan sesión, perfil activo y rol dentro del handler; el proxy protege páginas privadas compartidas y rutas por rol.
- Fase 2 completada: se agregó Vitest + React Testing Library con scripts `pnpm test` y `pnpm test:watch`.
- Fase 3 completada para solicitudes: la fachada `createSolicitudesActionService()` delega en casos de uso y servicios internos de inventario, movimientos y notificaciones.
- Fase 4 completada como mitigación de aplicación: aprobaciones y entregas parciales restauran inventario y revierten estado si falla una operación posterior. La frontera BD/aplicación está documentada en `DATABASE.md`.
- Fase 5 completada para perfil/configuración común: perfiles por rol usan `UserProfilePageContent`; configuración de donante y solicitante usa `UserSettingsContent`.
- Fase 6 iniciada: se redujeron páginas App Router con `'use client'` de 41 a 35 mediante wrappers server + client islands.

## 2. Objetivo

Mejorar la calidad del código y reducir riesgos en flujos críticos mediante cambios incrementales, verificables y compatibles con la arquitectura actual.

Objetivos específicos:

- Reforzar autorización en endpoints administrativos y rutas con permisos elevados.
- Agregar una base mínima de pruebas antes de modificar flujos críticos.
- Separar responsabilidades en servicios grandes de solicitudes, donaciones e inventario.
- Reducir duplicación entre páginas y componentes por rol.
- Alinear gradualmente el frontend con mejores prácticas de App Router.
- Mantener documentación actualizada durante el proceso.

## 3. Alcance

### Incluido

- API routes administrativas y operativas sensibles.
- Servicios de solicitudes, donaciones, inventario, notificaciones y comprobantes.
- Componentes y páginas repetidas por rol.
- Documentación técnica y propuesta de cambios.
- Scripts de validación y pruebas automatizadas mínimas.

### No Incluido

- Reescritura completa del sistema.
- Migración a microservicios.
- Cambio de proveedor de base de datos o autenticación.
- Rediseño visual completo.
- Cambios funcionales no relacionados con seguridad, mantenibilidad o consistencia.

## 4. Diagnóstico Base

Estado validado:

- `pnpm lint` pasa.
- `pnpm build` pasa con Next.js 16.2.3.
- `pnpm test` pasa.
- TypeScript usa `strict: true`.
- `src` contiene aproximadamente 339 archivos y 50k líneas.
- 35 de 43 páginas usan `'use client'`.

Hallazgos principales de la línea base, ya intervenidos por este refactor:

- `/api/admin/usuarios` usaba service role sin validación server-side completa.
- La acción de solicitudes mezclaba aprobación, rechazo, entrega, reversión, inventario, movimientos, comprobantes, QR, emails y notificaciones en una sola fachada.
- Algunos flujos actualizan estado e inventario en pasos separados.
- Hay duplicación entre páginas de perfil y configuración por rol.
- `donationActionService.ts` conserva bloques grandes de código comentado legacy.

## 5. Cambios Propuestos por Fase

### Fase 1 - Seguridad de API Routes

Prioridad: Alta.

Cambios:

- Crear helper server-side para obtener usuario autenticado y perfil activo.
- Validar rol `ADMINISTRADOR` en `/api/admin/usuarios`.
- Validar rol y estado en endpoints que usen permisos elevados.
- Reemplazar `updates` arbitrario por una whitelist de campos modificables.
- Estandarizar respuestas `401`, `403`, `400` y `500`.

Entregables:

- Helper de autorización reutilizable: implementado en `src/lib/server-auth.ts`.
- `/api/admin/usuarios`, APIs operativas, comprobantes y proxies de consulta de identidad protegidos: implementado.
- Documentación de patrón de autorización para API routes: documentado en `ARCHITECTURE.md`.

Criterios de aceptación:

- Un usuario no autenticado recibe `401`.
- Un usuario autenticado sin rol admin recibe `403`.
- Solo campos permitidos pueden actualizarse.
- `pnpm lint` y `pnpm build` pasan.

### Fase 2 - Pruebas de Caracterización

Prioridad: Alta.

Cambios:

- Agregar framework de pruebas para TypeScript.
- Crear script `pnpm test`.
- Cubrir comportamiento actual antes de refactorizar lógica crítica.
- Crear tests para helpers puros y casos de uso principales.

Entregables:

- Configuración de pruebas: implementada con `vitest.config.ts`.
- Tests mínimos para autorización, validaciones y servicios críticos: implementados.

Criterios de aceptación:

- `pnpm test` ejecuta correctamente.
- Los tests documentan el comportamiento actual sin cambiar reglas de negocio.
- El refactor posterior cuenta con red de seguridad básica.

### Fase 3 - Separación de Servicios Críticos

Prioridad: Alta.

Cambios:

- Dividir `solicitudesActionService.ts` en casos de uso:
  - aprobar solicitud
  - rechazar solicitud
  - entregar solicitud
  - revertir solicitud
  - procesar entrega parcial
- Extraer lógica de inventario:
  - búsqueda de productos
  - validación de stock
  - conversión de unidades
  - descuento y restauración
- Extraer lógica de notificaciones y comprobantes fuera del flujo principal.
- Mantener una fachada compatible para hooks existentes.

Entregables:

- Servicios más pequeños por responsabilidad: implementado para solicitudes.
- Tipos compartidos ordenados: ampliados para resultados de inventario.
- Código comentado legacy eliminado o documentado fuera del código activo: aplicado en donaciones.

Criterios de aceptación:

- Ningún archivo crítico nuevo concentra múltiples casos de uso.
- Los flujos existentes mantienen comportamiento.
- Tests, lint y build pasan.

### Fase 4 - Consistencia Transaccional de Inventario

Prioridad: Alta.

Cambios:

- Revisar flujos donde se actualiza estado, inventario y movimientos en pasos separados.
- Mover operaciones críticas a RPC/funciones SQL transaccionales cuando aplique.
- Definir estrategia para rollback o fallo controlado.
- Documentar qué capa gobierna cada operación de inventario.

Entregables:

- Operaciones críticas de inventario con unidad transaccional clara: implementado mediante compensación explícita para solicitudes.
- Documentación actualizada en `docs/DATABASE.md`: implementado.

Criterios de aceptación:

- Una aprobación no puede dejar solicitud aprobada sin descuento o movimiento esperado.
- Los errores devuelven mensajes claros y no silencian estados parciales.
- Tests cubren casos de stock insuficiente y fallo de operación.

### Fase 5 - Refactor Frontend por Rol

Prioridad: Media.

Cambios:

- Extraer componente compartido para páginas de perfil.
- Unificar cambio de contraseña y preferencias comunes.
- Mantener wrappers por rol solo para título, permisos y navegación.
- Reducir duplicación entre `admin`, `operador`, `donante` y `user`.

Entregables:

- Componentes compartidos de perfil/configuración: implementado.
- Páginas por rol más pequeñas y declarativas: implementado para perfiles y configuración común.

Criterios de aceptación:

- No se duplica lógica de carga de perfil entre roles.
- Los permisos por rol siguen aplicándose desde `DashboardLayout` y/o server-side.
- La UI mantiene el mismo comportamiento visible.

### Fase 6 - Optimización App Router

Prioridad: Media.

Cambios:

- Identificar páginas de lectura que no requieren estado local.
- Migrar gradualmente dashboards y reportes simples a Server Components.
- Mantener componentes interactivos como Client Components.
- Reducir consultas duplicadas de perfil cuando el servidor ya puede resolver sesión y rol.

Entregables:

- Lista de páginas candidatas: documentada en `COMPONENTS.md`.
- Migración incremental de vistas de lectura: iniciada con páginas de perfil/configuración común.
- Documentación de patrón Server Component + Client Island: documentado en `COMPONENTS.md`.

Criterios de aceptación:

- No se pierde interactividad en filtros, modales o formularios.
- Disminuye la necesidad de `'use client'` en páginas de solo lectura.
- Build sigue generando rutas correctamente.

## 6. Orden Recomendado

1. Seguridad de APIs sensibles y páginas privadas.
2. Base de pruebas automatizadas.
3. Separación de servicios de solicitudes.
4. Consistencia transaccional de inventario.
5. Limpieza de donaciones y código legacy comentado.
6. Refactor de perfil/configuración por rol.
7. Migración selectiva a Server Components.

## 7. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Cambiar flujos de inventario rompe stock o trazabilidad | Alto | Tests de caracterización y cambios por caso de uso |
| Endpoints con service role permiten acciones no autorizadas | Alto | Autorización server-side obligatoria |
| Refactor grande difícil de revisar | Medio | Commits pequeños por fase |
| Migrar a Server Components rompe interactividad | Medio | Mantener formularios y modales como Client Components |
| Falta de pruebas oculta regresiones | Alto | Agregar `pnpm test` antes de tocar lógica crítica |

## 8. Plan de Validación

Cada fase debe cerrar con:

- `pnpm lint`
- `pnpm build`
- `pnpm test`
- Revisión manual del flujo afectado
- Actualización de documentación si cambia arquitectura o comportamiento

Flujos mínimos a validar manualmente:

- Crear usuario administrador desde panel admin.
- Cambiar estado de donación.
- Aprobar solicitud con stock suficiente.
- Rechazar solicitud con motivo.
- Registrar entrega parcial.
- Dar de baja producto.
- Revisar dashboard por rol.

## 9. Resultado Esperado

Al finalizar la propuesta, el sistema debe conservar su comportamiento funcional actual, pero con:

- Endpoints sensibles protegidos correctamente.
- Servicios críticos más pequeños y mantenibles.
- Menor riesgo de estados parciales en inventario.
- Base inicial de pruebas automatizadas.
- Menos duplicación de UI por rol.
- Documentación alineada con la arquitectura real.

## 10. Criterio de Cierre

La refactorización se considera completa cuando:

- Los riesgos de autorización con service role están corregidos en los endpoints intervenidos.
- Existe suite mínima de pruebas y se ejecuta en validación local.
- Los servicios críticos de solicitudes ya no concentran múltiples casos de uso no relacionados.
- Los flujos de inventario intervenidos tienen una unidad transaccional clara o compensación explícita.
- `ARCHITECTURE.md`, `COMPONENTS.md`, `WORKFLOW.md`, `DATABASE.md` y documentos de calidad reflejan el estado final.
