# Pruebas y validación

Este documento concentra las validaciones automatizadas y la matriz manual para
la entrega académica. La suite usa Vitest y React Testing Library; no se agrega
automatización E2E en esta etapa.

## Comandos obligatorios

Ejecuta los comandos desde la raíz del repositorio:

```bash
pnpm test
pnpm test:coverage
pnpm test:coverage:critical
pnpm test:integration
pnpm lint
pnpm build
```

`pnpm test:coverage` genera el reporte V8 en `coverage/`. Ese directorio está
ignorado por Git y sirve como evidencia local de la ejecución.

## Registro automatizado de esta entrega

| Comando | Resultado registrado el 2026-07-24 |
|---------|-------------------------------------|
| `pnpm test` | Aprobado: 35 archivos, 210 pruebas; la suite de integración se ejecuta por separado |
| `pnpm test:coverage` | Aprobado: 71.46% statements, 62.20% branches, 69.37% funciones y 73.47% líneas |
| `pnpm test:coverage:critical` | Aprobado: 86.43% statements, 75.97% branches, 94.95% funciones y 88.06% líneas |
| `pnpm test:integration` | Aprobado: 2 pruebas ejecutadas contra Supabase local mediante Podman |
| `pnpm lint` | Aprobado |
| `pnpm build` | Aprobado: Next.js 16.2.10 compiló y generó 49 páginas estáticas |

La cobertura global tiene un umbral inicial de 60% para statements y líneas,
50% para ramas y 60% para funciones. La configuración separada de cobertura
crítica exige 80% de statements/líneas y 70% de ramas. Los umbrales globales
pueden elevarse progresivamente a 65% y 70% cuando se cubran los componentes
visuales y plantillas que están fuera de la prioridad P0.

## Integración real con Supabase local

La suite `tests/integration/supabase-security.test.ts` no usa la base remota.
Para ejecutarla contra una instancia local, inicia Supabase desde la raíz y
exporta las credenciales mostradas por el CLI. Con Docker, el arranque directo
es:

```bash
SUPABASE_TELEMETRY_DISABLED=1 supabase start
RUN_SUPABASE_INTEGRATION=true \
SUPABASE_TEST_URL=http://127.0.0.1:54321 \
SUPABASE_TEST_PUBLISHABLE_KEY=... \
SUPABASE_TEST_SERVICE_ROLE_KEY=... \
pnpm test:integration
```

Con Podman, expón temporalmente su API compatible con Docker y conserva ese
socket mientras se ejecutan `supabase start`, las pruebas y `supabase stop`:

```bash
podman system service --time=0 unix:///tmp/podman.sock
DOCKER_HOST=unix:///tmp/podman.sock SUPABASE_TELEMETRY_DISABLED=1 supabase start
# Ejecuta la suite con las mismas variables del ejemplo anterior.
DOCKER_HOST=unix:///tmp/podman.sock SUPABASE_TELEMETRY_DISABLED=1 supabase stop
```

La preparación crea usuarios temporales mediante Auth administrativo; las
operaciones bajo prueba usan clientes autenticados y el cierre elimina esos
usuarios. Las pruebas comprueban aislamiento por RLS en `solicitudes` y que un
solicitante no pueda ejecutar el RPC administrativo de aprobación de catálogo.
La ejecución unitaria con mocks valida reglas de aplicación y cobertura de
código; no sustituye esta validación de RLS, RPC, triggers o consistencia de
inventario en PostgreSQL.

## Cobertura funcional automatizada

| Área | Evidencia principal |
|------|---------------------|
| Donaciones | `src/modules/donante/donaciones/services/donacionesService.test.ts`, `src/modules/donante/nueva-donacion/services/nuevaDonacionService.test.ts` y acciones administrativas |
| Inventario | `src/modules/user/services/inventoryStockService.test.ts`, APIs de inventario y validaciones de unidades/entradas |
| Bajas | `src/app/api/operador/bajas/route.test.ts`, `estadisticas/route.test.ts` y alertas de vencimiento |
| Servicios externos | `src/app/api/proxy/consultar-ruc/route.test.ts` y `consultar-cedula/route.test.ts`, incluyendo autenticación, URL HTTPS y rate limit |
| Autorización | APIs de usuarios, comprobantes, cancelaciones, catálogo, notificaciones y operaciones de operador |

## Matriz de pruebas manuales

La persona que ejecuta la validación debe registrar fecha, usuario de prueba,
resultado y captura en la columna de evidencia. Cada caso debe ejecutarse con
una cuenta del rol indicado y con datos de prueba identificables.

| ID | Rol | Caso | Resultado esperado | Resultado | Evidencia |
|----|-----|------|-------------------|-----------|-----------|
| ADM-01 | Administrador | Crear, editar, bloquear y desactivar un usuario | El cambio queda guardado y el acceso respeta el nuevo estado | Pendiente | |
| ADM-02 | Administrador | Revisar y aprobar/rechazar una solicitud de alta de alimento | El catálogo refleja la decisión y el usuario recibe notificación | Pendiente | |
| ADM-03 | Administrador | Consultar reportes de solicitudes, donaciones, inventario y bajas | Los filtros y totales cargan sin errores | Pendiente | |
| ADM-04 | Administrador | Cancelar una donación pendiente y consultar el historial | La donación queda cancelada con motivo, responsable y fecha | Pendiente | |
| OPE-01 | Operador | Consultar solicitudes pendientes y aprobar una con stock suficiente | Se descuenta el stock FEFO y se registra el movimiento | Pendiente | |
| OPE-02 | Operador | Registrar entrega total o parcial | La solicitud, el saldo y el historial quedan consistentes | Pendiente | |
| OPE-03 | Operador | Ajustar una entrada de inventario | Se actualiza la entrada y se registra el ajuste | Pendiente | |
| OPE-04 | Operador | Dar de baja una cantidad por vencimiento u otro motivo | Se registra la baja sobre `id_entrada` y se muestra el saldo restante | Pendiente | |
| OPE-05 | Operador | Generar y consultar un comprobante | El comprobante corresponde a la operación y respeta el rol | Pendiente | |
| DON-01 | Donante | Registrarse, verificar identidad y completar perfil | La cuenta queda activa según el flujo de autenticación | Pendiente | |
| DON-02 | Donante | Crear una donación con alimento y unidad del catálogo | La donación queda pendiente y aparece en el seguimiento | Pendiente | |
| DON-03 | Donante | Editar o cancelar una donación pendiente | Solo se modifica/cancela una donación propia pendiente | Pendiente | |
| SOL-01 | Solicitante | Crear una solicitud con ubicación y unidad | La solicitud queda pendiente y se puede consultar | Pendiente | |
| SOL-02 | Solicitante | Dar seguimiento a una solicitud aprobada, rechazada o entregada | El estado y las observaciones se muestran correctamente | Pendiente | |
| SOL-03 | Solicitante | Consultar comprobante de entrega | El código y el detalle de la entrega son consistentes | Pendiente | |

## Criterio de cierre

La validación manual se considera completa cuando todos los casos aplicables
tienen resultado `Aprobado`, una fecha, el rol utilizado y una evidencia. Los
casos que requieran correo real, Vercel o datos de producción deben ejecutarse
en el entorno autorizado y no con credenciales incrustadas en el repositorio.

Las pruebas E2E automatizadas quedan como mejora futura; los flujos anteriores
son la guía de aceptación manual de esta entrega.
