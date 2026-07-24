# 🔄 Flujos de Trabajo - Banco de Alimentos ULEAM

## Índice
- [Flujo de Usuario (User Journey)](#flujo-de-usuario-user-journey)
- [Flujo Técnico (Request Lifecycle)](#flujo-técnico-request-lifecycle)
- [Flujos de Negocio Principales](#flujos-de-negocio-principales)
- [El Rol de proxy.ts](#el-rol-de-proxyts)
- [Diagramas de Secuencia](#diagramas-de-secuencia)

---

## Flujo de Usuario (User Journey)

Este documento describe cómo los usuarios interactúan con el sistema desde la perspectiva de cada rol.

### 👤 Usuario Beneficiario (SOLICITANTE)

```mermaid
graph LR
    A[Llega al sitio] --> B{¿Tiene cuenta?}
    B -->|No| C[Registrarse]
    B -->|Sí| D[Iniciar Sesión]
    C --> E[Verificar Email]
    E --> F[Completar Perfil]
    F --> G[Dashboard Beneficiario]
    D --> H{¿Perfil completo?}
    H -->|No| F
    H -->|Sí| G
    G --> I[Solicitar Alimentos]
    I --> J[Completar Formulario]
    J --> K[Enviar Solicitud]
    K --> L[Seguimiento de Estado]
    L --> M{Estado}
    M -->|Aprobada| N[Ver Comprobante]
    M -->|Rechazada| O[Ver Motivo]
    M -->|Pendiente| P[Esperar Respuesta]
    N --> Q[Recoger Alimentos]
```

#### Pasos Detallados:

1. **Registro**
   - Accede a `/auth/registrar`
   - Ingresa email, contraseña y selecciona rol "Beneficiario"
   - Recibe email de verificación
   - Hace clic en el link de verificación

2. **Completar Perfil**
   - Redirigido a `/perfil/completar`
   - Ingresa datos personales (nombre, cédula, teléfono)
   - Valida cédula con API del gobierno ecuatoriano
   - Indica ubicación en el mapa (Mapbox)
   - Guarda perfil

3. **Solicitar Alimentos**
   - Navega a `/user/formulario`
   - Selecciona tipo de alimento del catálogo
   - Indica cantidad y unidad de medida
   - Agrega comentarios adicionales
   - Confirma ubicación de entrega
   - Envía solicitud

4. **Seguimiento**
   - Ve sus solicitudes en `/user/solicitudes`
   - Recibe notificaciones de cambios de estado
   - Puede ver detalles de cada solicitud
   - Descarga comprobante si fue aprobada

---

### 🎁 Usuario Donante

```mermaid
graph LR
    A[Iniciar Sesión] --> B[Dashboard Donante]
    B --> C[Nueva Donación]
    C --> D{Tipo de Persona}
    D -->|Jurídica| E[Ingresar RUC y datos empresa]
    D -->|Natural| F[Ingresar Cédula]
    E --> G[Validar con API]
    F --> G
    G --> H[Seleccionar Alimentos]
    H --> I{¿Producto en catálogo?}
    I -->|Sí| J[Seleccionar del catálogo]
    I -->|No| K[Producto personalizado]
    J --> L[Indicar cantidad y unidad]
    K --> L
    L --> M[Fecha de vencimiento]
    M --> N[Dirección de recogida]
    N --> O[Enviar Donación]
    O --> P[Seguimiento]
    P --> Q{Estado}
    Q -->|Pendiente| R[Esperar recogida]
    Q -->|Recogida| S[En tránsito]
    Q -->|Entregada| T[Ver Impacto]
```

#### Pasos Detallados:

1. **Crear Donación**
   - Navega a `/donante/nueva-donacion`
   - Completa formulario de donante (auto-llena desde perfil)
   - Valida RUC o cédula con la API
   - Selecciona alimentos a donar

2. **Configurar Donación**
   - Selecciona alimento del catálogo o crea personalizado
   - Indica cantidad y unidad de medida
   - Establece fecha de vencimiento
   - Indica fecha disponible para recogida
   - Proporciona dirección de entrega
   - Agrega observaciones

3. **Impacto Social**
   - El sistema calcula automáticamente:
     - Personas alimentadas estimadas
     - Equivalente en comidas
   - Ve estadísticas en su dashboard

---

### 🔧 Usuario Operador

```mermaid
graph LR
    A[Dashboard Operador] --> B{Acción}
    B -->|Gestionar Donaciones| C[Ver Lista Donaciones]
    B -->|Gestionar Solicitudes| D[Ver Lista Solicitudes]
    B -->|Inventario| E[Ver Inventario]
    B -->|Bajas| F[Gestionar Bajas]
    
    C --> G[Cambiar Estado]
    G --> H[Pendiente → Recogida → Entregada]
    H --> I[Actualizar Inventario]
    
    D --> J{Revisar Solicitud}
    J -->|Aprobar| K[Verificar Stock]
    K --> L[Descontar Inventario]
    L --> M[Generar Comprobante]
    J -->|Rechazar| N[Indicar Motivo]
    
    E --> O[Ver Stock por Depósito]
    O --> P[Ajustar Cantidades]
    P --> Q[Registrar Movimiento]
    
    F --> R[Seleccionar Producto]
    R --> S[Indicar Motivo Baja]
    S --> T[Confirmar Baja]
    T --> U[Actualizar Inventario]
```

#### Flujos Principales:

1. **Gestión de Donaciones**
   - Ve donaciones pendientes en `/operador/donaciones`
   - Marca donación como "Recogida"
   - Coordina logística de recogida
   - Marca como "Entregada" cuando llega al depósito
   - El trigger crea una entrada independiente en `entradas_inventario`

2. **Aprobación de Solicitudes**
   - Ve solicitudes pendientes en `/operador/solicitudes`
   - Revisa detalles de la solicitud
   - Verifica disponibilidad sumando entradas compatibles
   - Aprueba o rechaza con motivo
   - La RPC descuenta entradas con FEFO y devuelve sus `id_entrada`
   - Se genera comprobante con código único

3. **Control de Inventario**
   - Ve stock en tiempo real por depósito
   - Puede ajustar cantidades manualmente
   - Registra bajas de productos (vencidos, dañados)
   - Todos los movimientos conservan `id_entrada` para trazabilidad

---

### 👨‍💼 Usuario Administrador

```mermaid
graph TB
    A[Dashboard Admin] --> B[Gestión Completa]
    B --> C[Usuarios]
    B --> D[Catálogo]
    B --> E[Reportes]
    B --> F[Configuración]
    
    C --> C1[Crear/Editar/Bloquear]
    D --> D1[Alimentos/Unidades/Categorías]
    E --> E1[Donaciones/Solicitudes/Inventario/Movimientos]
    F --> F1[Sistema/Depósitos/Notificaciones]
```

El administrador tiene acceso completo a todas las funcionalidades del sistema.

---

## Flujo Técnico (Request Lifecycle)

Este diagrama muestra el ciclo de vida completo de una petición HTTP en el sistema.

### 🔄 Ciclo de Vida de una Request

```mermaid
sequenceDiagram
    autonumber
    participant Browser
    participant Middleware
    participant AppRouter
    participant ServerComponent
    participant Service
    participant Supabase
    participant PostgreSQL
    
    Browser->>Middleware: GET /donante/dashboard
    Note over Middleware: proxy.ts
    
    Middleware->>Supabase: Verificar sesión (cookies)
    Supabase-->>Middleware: Usuario autenticado
    
    Middleware->>PostgreSQL: SELECT * FROM usuarios WHERE id = ?
    PostgreSQL-->>Middleware: {rol: 'DONANTE', estado: 'activo'}
    
    alt Usuario autorizado
        Middleware->>AppRouter: Permitir acceso
        AppRouter->>ServerComponent: Renderizar página
        
        ServerComponent->>Service: getDonacionesStats()
        Service->>Supabase: Query donaciones
        Supabase->>PostgreSQL: SELECT con RLS aplicado
        PostgreSQL-->>Supabase: Resultados
        Supabase-->>Service: Datos filtrados
        Service-->>ServerComponent: Stats procesadas
        
        ServerComponent->>Browser: HTML renderizado (SSR)
    else Usuario no autorizado
        Middleware->>Browser: Redirect a login con error=forbidden
    end
```

### Desglose de Capas:

#### 1. **Middleware Layer** (`proxy.ts`)

**Responsabilidad**: Autenticación, autorización y enrutamiento

```typescript
// Flujo en proxy.ts
export async function proxy(request: NextRequest) {
  // 1. Crear cliente Supabase con cookies
  const supabase = await createServerSupabaseClient();

  // 2. Verificar sesión
  const { data: { user } } = await supabase.auth.getUser();

  // 3. Regla especial para completar perfil
  if (isCompletarPerfilPath(pathname)) {
    return handleProfileCompletionRoute(request, supabase, user);
  }

  // 4. Validar ruta pública con match exacto o por segmento
  if (isAnyRouteMatch(pathname, RUTAS_PUBLICAS)) {
    return NextResponse.next();
  }

  // 5. Identificar rutas privadas compartidas o por rol
  const roleAccess = getRoleAccessForPath(pathname);
  const isPrivatePage =
    pathname === '/dashboard' ||
    isAnyRouteMatch(pathname, SHARED_PRIVATE_ROUTES) ||
    roleAccess;

  if (!isPrivatePage) {
    return NextResponse.next();
  }

  // 6. Rutas privadas: sesión, usuario activo, perfil completo y rol si aplica
  return protectPrivateRoute(request, supabase, user, roleAccess?.role);
}
```

**Mapa de rutas protegidas por `proxy.ts`:**

```typescript
const SHARED_PRIVATE_ROUTES = [
  '/perfil/actualizar',
  '/notificaciones',
  '/configuracion-notificaciones',
  '/comprobante',
];

const ROLE_PROTECTED_ROUTES = [
  { route: '/admin', role: 'ADMINISTRADOR' },
  { route: '/operador', role: 'OPERADOR' },
  { route: '/donante', role: 'DONANTE' },
  { route: '/user', role: 'SOLICITANTE' },
];
```

**Reglas de redirección:**

- Sin sesión en ruta privada: `/auth/iniciar-sesion?error=unauthorized&callbackUrl=...`.
- Perfil incompleto: `/perfil/completar`.
- Perfil completo intentando `/perfil/completar`: dashboard según rol.
- Usuario `bloqueado` o `desactivado`: cierre de sesión y login con error.
- Rol incorrecto en prefijo por rol: login con `error=forbidden`.

**Puntos clave**:
- Se ejecuta ANTES de cualquier página o API route no estática
- Tiene acceso a cookies de sesión
- Puede leer y modificar la request/response
- Realiza queries a la base de datos para validar roles
- Las API routes sensibles no dependen solo del proxy; validan sesión, perfil activo y rol dentro del handler

---

#### 2. **App Router Layer** (Next.js)

**Responsabilidad**: Enrutamiento y renderizado

```typescript
// src/app/donante/dashboard/page.tsx
export default async function DonanteDashboard() {
  // Server Component - se ejecuta en el servidor
  
  // 1. Obtener sesión (ya validada por middleware)
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // 2. Llamar al servicio de negocio
  const stats = await donacionService.getStats(user!.id);
  
  // 3. Renderizar componentes
  return (
    <DashboardLayout>
      <StatsCards data={stats} />
      <DonacionesRecientes userId={user!.id} />
    </DashboardLayout>
  );
}
```

**Características**:
- **Capacidad de Server Components**: Next.js permite renderizado en servidor para páginas de lectura
- **Estado actual**: 35 de 43 páginas del proyecto usan `'use client'`
- **Acceso a servicios**: Las páginas cliente consumen hooks, servicios y API routes; las páginas servidor pueden usar clientes server-side
- **Patrón aplicado**: Perfil y configuración común usan wrappers Server Component con islas cliente para carga/interacción
- **Oportunidad de mejora**: Migrar dashboards y vistas de solo lectura restantes a Server Components para aprovechar caching, streaming y menor JavaScript en cliente

---

#### 3. **Service Layer** (Lógica de Negocio)

**Responsabilidad**: Implementar reglas de negocio

```typescript
// src/modules/donante/donaciones/services/donacionService.ts
export class DonacionService {
  async crear(donacion: DonacionInput, userId: string) {
    // 1. Validar datos
    const validacion = validarDonacion(donacion);
    if (!validacion.success) {
      throw new Error('Datos inválidos');
    }
    
    // 2. Calcular impacto
    const impacto = calcularImpacto(
      donacion.cantidad,
      donacion.tipo_producto
    );
    
    // 3. Crear en base de datos
    const { data, error } = await this.supabase
      .from('donaciones')
      .insert({
        ...donacion,
        user_id: userId,
        impacto_estimado_personas: impacto.personas,
        impacto_equivalente: impacto.equivalente,
        estado: 'Pendiente'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // 4. Crear notificación para operadores
    await notificationService.crear({
      titulo: 'Nueva donación recibida',
      mensaje: `${donacion.tipo_producto} - ${donacion.cantidad}`,
      tipo: 'info',
      rol_destinatario: 'OPERADOR',
      categoria: 'donaciones',
      url_accion: `/operador/donaciones/${data.id}`
    });
    
    return { success: true, data };
  }
}
```

**Características**:
- **Encapsulamiento**: Toda la lógica de negocio en un lugar
- **Reutilizable**: Se usa desde páginas, API routes, y otros servicios
- **Testabilidad incremental**: Solicitudes ya separa casos de uso y servicios internos con tests sobre mocks de Supabase/inventario/movimientos
- **Type-safe**: TypeScript garantiza tipos correctos

---

#### 4. **Data Access Layer** (Supabase)

**Responsabilidad**: Interactuar con la base de datos

```typescript
// El servicio usa el cliente Supabase
const { data, error } = await supabase
  .from('donaciones')
  .insert(donacion)
  .select()
  .single();

// Supabase automáticamente:
// 1. Aplica Row Level Security (RLS)
// 2. Valida permisos según políticas
// 3. Ejecuta el query en PostgreSQL
// 4. Retorna datos filtrados
```

**Row Level Security (RLS) en acción**:
```sql
-- Política en PostgreSQL
CREATE POLICY "donante_select_own_donaciones" ON donaciones
  FOR SELECT USING (auth.uid() = user_id);

-- Cuando el donante hace query:
SELECT * FROM donaciones;  
-- PostgreSQL automáticamente agrega:
-- WHERE auth.uid() = user_id

-- El donante SOLO ve sus propias donaciones
```

---

## El Rol de proxy.ts

### 🛡️ Middleware de Autenticación y Autorización

El archivo `proxy.ts` es un **Middleware de Next.js** que intercepta las peticiones no estáticas antes de que lleguen a su destino.

#### ¿Por qué se llama "proxy"?

El nombre puede ser confuso, pero hace referencia a que actúa como un **intermediario** entre el cliente y las páginas/API routes. No es un proxy inverso tradicional, sino un **middleware de autenticación**.

#### Funciones Principales:

```mermaid
graph TD
    A[Request entrante] --> B{Middleware proxy.ts}
    B --> C{¿Ruta pública?}
    C -->|Sí| D[Permitir acceso]
    C -->|No| E{¿Ruta privada?}
    E -->|No| D
    E -->|Sí| F{¿Usuario autenticado?}
    F -->|No| R[Redirect a /auth/iniciar-sesion]
    F -->|Sí| G{¿Estado activo?}
    G -->|No| H[Cerrar sesión + Redirect]
    G -->|Sí| I{¿Perfil completo?}
    I -->|No| M[Redirect a /perfil/completar]
    I -->|Sí| J{¿Rol autorizado?}
    J -->|No| N[Redirect a login con forbidden]
    J -->|Sí| K[Permitir acceso]
    
    D --> P[Página/API Route]
    K --> P
```

#### Código Explicado:

```typescript
// src/proxy.ts
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RUTAS_PUBLICAS } from '@/lib/constantes';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  // 1. Crear respuesta que incluye cookies de Supabase
  const supabaseResponse = NextResponse.next({ request });

  try {
    // 2. Crear cliente Supabase con acceso a cookies
    const supabase = await createServerSupabaseClient();

    // 3. Obtener usuario de la sesión
    const { data: { user }, error } = await supabase.auth.getUser();
    const isAuthenticated = !!(user && !error);

    const { pathname } = request.nextUrl;

    // 4. Si el usuario está logueado y trata de ir a login/register
    if ((pathname === '/auth/iniciar-sesion' || pathname === '/auth/registrar') 
        && isAuthenticated && user) {
      // Obtener perfil para redirigir al dashboard correcto
      const { data: perfil } = await supabase
        .from('usuarios')
        .select('estado, rol')
        .eq('id', user.id)
        .single();

      if (perfil) {
        // Validar estado
        if (perfil.estado === 'bloqueado' || perfil.estado === 'desactivado') {
          await supabase.auth.signOut();
          return supabaseResponse;
        }

        // Redirigir al dashboard según el rol
        const dashboardMap = {
          'ADMINISTRADOR': '/admin/dashboard',
          'OPERADOR': '/operador/dashboard',
          'DONANTE': '/donante/dashboard',
          'SOLICITANTE': '/user/dashboard'
        };
        
        return NextResponse.redirect(
          new URL(dashboardMap[perfil.rol] || '/user/dashboard', request.url)
        );
      }
    }

    // 5. Verificar si la ruta es pública
    if (isAnyRouteMatch(pathname, RUTAS_PUBLICAS)) {
      return supabaseResponse;
    }

    // 6. Para rutas privadas, verificar sesión, perfil, estado y rol.
    const roleAccess = getRoleAccessForPath(pathname);
    if (pathname === '/dashboard' ||
        isAnyRouteMatch(pathname, SHARED_PRIVATE_ROUTES) ||
        roleAccess) {
      return protectPrivateRoute(request, supabase, user, roleAccess?.role);
    }

    return supabaseResponse;
  } catch (error) {
    console.error('Error inesperado en middleware:', error);
    // Las rutas protegidas fallan cerradas y redirigen a login.
    return supabaseResponse;
  }
}

// 9. Configurar qué rutas intercepta el middleware
export const config = {
  matcher: [
    /*
     * Coincide con todas las rutas EXCEPTO:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico
     * - archivos de imagen (.svg, .png, .jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

#### Puntos Clave:

1. **Se ejecuta en las peticiones no estáticas** (excepto assets e imágenes)
2. **Tiene acceso a cookies** (donde Supabase guarda el token)
3. **Puede hacer queries a la BD** para obtener perfil del usuario
4. **Puede redirigir** antes de que la petición llegue a la página
5. **Centraliza la protección de páginas privadas** (no se repite en cada página)
6. **Falla cerrado en rutas privadas** si ocurre un error de validación del proxy

#### Rutas por Categoría

| Categoría | Rutas | Regla |
|-----------|-------|-------|
| Públicas | `/`, `/contribuyentes`, `/auth/iniciar-sesion`, `/auth/registrar`, `/auth/olvide-contrasena`, `/auth/restablecer-contrasena`, `/auth/verificar-email` | Sin sesión |
| Completar perfil | `/perfil/completar` | Sesión requerida; permite perfil incompleto |
| Compartidas privadas | `/perfil/actualizar`, `/notificaciones`, `/configuracion-notificaciones`, `/comprobante/*` | Sesión, perfil activo y perfil completo |
| Por rol | `/admin/*`, `/operador/*`, `/donante/*`, `/user/*` | Sesión, perfil activo, perfil completo y rol correspondiente |
| Dashboard genérico | `/dashboard` | Redirige al dashboard del rol |

Las rutas `/api/*` pasan por el matcher del proxy, pero las APIs sensibles validan autorización dentro del handler. No se debe asumir que el proxy reemplaza la autorización server-side de una API.

---

## Flujos de Negocio Principales

### 🔐 Flujo: Crear o Actualizar Usuarios desde Admin

`/api/admin/usuarios` usa `SUPABASE_SERVICE_ROLE_KEY`, por lo que valida autorización dentro del handler aunque la ruta de página ya esté protegida por `proxy.ts`.

```mermaid
sequenceDiagram
    autonumber
    participant A as Admin Browser
    participant API as /api/admin/usuarios
    participant Auth as Supabase Auth Client
    participant Admin as Supabase Admin Client
    participant DB as usuarios

    A->>API: POST/PATCH
    API->>Auth: getUser()
    Auth-->>API: user o null

    alt Sin sesión
        API-->>A: 401 Usuario no autenticado
    else Sesión válida
        API->>DB: SELECT perfil por user.id
        DB-->>API: rol, estado

        alt Perfil inactivo o rol no admin
            API-->>A: 403 Rol no permitido
        else ADMINISTRADOR activo
            API->>API: Validar payload y whitelist
            API->>Admin: Crear/actualizar usuario con service role
            Admin-->>API: Resultado
            API-->>A: 200 o error controlado
        end
    end
```

Reglas:

- `POST`: solo `ADMINISTRADOR` activo puede crear usuarios.
- `PATCH`: solo `ADMINISTRADOR` activo puede modificar usuarios.
- `PATCH` rechaza campos fuera de whitelist.
- `rol` solo acepta `ADMINISTRADOR`, `OPERADOR`, `DONANTE`, `SOLICITANTE`.
- `estado` solo acepta `activo`, `bloqueado`, `desactivado`.

### 🔒 Flujo: APIs Operativas Protegidas

Las APIs con datos operativos usan `requireActiveUserRole(supabase, roles)` para unificar sesión, perfil activo y rol permitido.

| API | Roles permitidos |
|-----|------------------|
| `/api/admin/cancelaciones-donaciones` | `ADMINISTRADOR` |
| `/api/operador/bajas` | `ADMINISTRADOR`, `OPERADOR` |
| `/api/operador/bajas/estadisticas` | `ADMINISTRADOR`, `OPERADOR` |
| `/api/operador/alertas-vencimiento` | `ADMINISTRADOR`, `OPERADOR` |
| `/api/comprobante/[codigo]` | Usuario activo; admin/operador o dueño del comprobante |
| `/api/proxy/consultar-cedula` | Usuario autenticado |
| `/api/proxy/consultar-ruc` | Usuario autenticado |

Las APIs de cédula/RUC no exigen perfil completo porque se usan durante el flujo de completar perfil. Sí exigen sesión para evitar uso anónimo del proxy externo.

### 🔔 Flujo: Crear Notificaciones Seguras

`/api/notificaciones` usa `SUPABASE_SERVICE_ROLE_KEY`, pero el cliente solo puede enviar eventos controlados:

```json
{
  "event": "catalog_food_request_created",
  "entityId": "55555555-5555-4555-8555-555555555555"
}
```

Reglas:

- La ruta valida sesión con el cliente normal de Supabase.
- La ruta valida perfil activo con el cliente admin.
- `notificationEventDispatcher` valida el rol permitido y el ownership/contexto de `entityId`.
- El servidor construye `titulo`, `mensaje`, destinatario, URL, metadata y email.
- La ruta rechaza campos sensibles enviados desde cliente, como `destinatarioId`, `rolDestinatario`, `email`, `titulo` o `mensaje`.

Eventos permitidos:

| Evento | Roles que pueden dispararlo | Destinatario |
|--------|-----------------------------|--------------|
| `catalog_food_request_created` | `DONANTE` | `ADMINISTRADOR` |
| `catalog_food_request_reviewed` | `ADMINISTRADOR` | Donante dueño de la solicitud |
| `food_request_status_changed` | `ADMINISTRADOR`, `OPERADOR` | Solicitante dueño |
| `donation_status_changed` | `ADMINISTRADOR`, `OPERADOR` | Donante dueño |

### 📦 Flujo: Aprobar Solicitud con Inventario

La fachada `createSolicitudesActionService()` conserva la API pública usada por hooks y páginas, pero delega en casos de uso internos.

```mermaid
sequenceDiagram
    autonumber
    participant O as Operador/Admin
    participant F as useSolicitudActions
    participant UC as approveSolicitud
    participant INV as solicitudesInventoryService
    participant MOV as solicitudesMovementService
    participant DB as Supabase
    participant NOT as solicitudesNotificationService

    O->>F: Aprobar solicitud
    F->>UC: solicitud, operador, depósito
    UC->>INV: validarStockDisponible()

    alt Stock insuficiente
        UC-->>F: error sin modificar estado
    else Stock suficiente
        UC->>INV: descontarDelInventario()
        UC->>DB: UPDATE solicitudes estado=aprobada
        UC->>MOV: registrarMovimientoSolicitud()

        alt Falla update o movimiento
            UC->>INV: restaurarInventario()
            UC->>DB: rollback estado anterior
            UC-->>F: error controlado
        else Todo OK
            UC->>NOT: notificarCambioEstado()
            UC-->>F: success
        end
    end
```

Este flujo evita que una solicitud quede aprobada sin descuento efectivo o sin movimiento esperado.

### 📦 Flujo Completo: Crear una Donación

```mermaid
sequenceDiagram
    autonumber
    participant D as Donante (Browser)
    participant M as Middleware
    participant P as Página /donante/nueva-donacion
    participant API as API Route /api/donaciones
    participant S as DonacionService
    participant SB as Supabase
    participant DB as PostgreSQL
    
    D->>M: GET /donante/nueva-donacion
    M->>SB: Verificar sesión
    SB-->>M: Usuario autenticado (rol: DONANTE)
    M->>P: Permitir acceso
    P-->>D: Renderizar formulario
    
    D->>P: Completar formulario
    D->>P: Clic en "Crear Donación"
    P->>API: POST /api/donaciones
    
    API->>SB: Verificar sesión
    SB-->>API: Usuario autenticado
    
    API->>S: donacionService.crear(datos, userId)
    
    S->>S: Validar datos
    S->>S: Calcular impacto
    
    S->>SB: INSERT INTO donaciones
    SB->>DB: Ejecutar query con RLS
    DB-->>SB: Donación creada
    SB-->>S: {id, estado: 'Pendiente'}
    
    Note over S: La creación queda en Pendiente. Las notificaciones de donación se emiten cuando admin/operador cambia el estado.
    
    S-->>API: {success: true, data}
    API-->>P: Response 200
    P-->>D: Mostrar éxito + Redirect
    
    Note over D: Redirigido a /donante/donaciones
```

---

### ✅ Flujo Completo: Aprobar una Solicitud

```mermaid
sequenceDiagram
    autonumber
    participant O as Operador (Browser)
    participant P as Página /operador/solicitudes
    participant API as API Route /api/solicitudes/[id]
    participant S as SolicitudService
    participant IS as InventarioService
    participant DB as PostgreSQL (con Triggers)
    participant NAPI as /api/notificaciones
    participant NS as NotificationService
    
    O->>P: Ver solicitud pendiente
    O->>P: Clic en "Aprobar"
    P->>API: PATCH /api/solicitudes/123 {estado: 'aprobada'}
    
    API->>S: solicitudService.aprobar(solicitudId, operadorId)
    
    S->>IS: Verificar stock disponible
    IS->>DB: SELECT entradas_inventario disponibles WHERE producto = ?
    DB-->>IS: Suma de entradas compatibles: 50
    IS-->>S: Stock suficiente
    
    S->>DB: RPC descontar_stock_por_lote(...)
    DB->>DB: Bloquear entradas y aplicar FEFO
    DB-->>S: idEntrada y cantidad descontada por lote
    
    S->>DB: UPDATE solicitudes SET estado = 'aprobada'
    S->>DB: INSERT movimiento con id_entrada
    
    S->>DB: Generar código comprobante único
    S->>DB: UPDATE solicitudes SET codigo_comprobante = ?
    
    Note over S: Si falla un paso posterior, restaura cada id_entrada afectado
    
    S->>NAPI: POST {event: food_request_status_changed, entityId}
    NAPI->>NAPI: Validar sesión, perfil activo y rol permitido
    NAPI->>NS: Construir notificación server-side
    NS->>DB: INSERT INTO notificaciones
    
    S-->>API: {success: true, comprobante}
    API-->>P: Response 200
    P-->>O: Mostrar éxito + Comprobante generado
```

**Aspectos importantes:**
1. Todo ocurre en una **transacción** para garantizar consistencia
2. La RPC de inventario bloquea entradas y aplica FEFO
3. El stock se **descuenta directamente en entradas_inventario**
4. Se **genera un comprobante** con código único
5. Se envía **notificación** al beneficiario

---

### 📊 Flujo: Actualizar Inventario desde Donación Aprobada

```mermaid
sequenceDiagram
    autonumber
    participant O as Operador
    participant API as API Route
    participant S as DonacionService
    participant DB as PostgreSQL
    participant T as Database Trigger
    
    O->>API: PATCH /api/donaciones/456 {estado: 'Aprobada'}
    API->>S: donationActionService.updateDonationEstado(id, 'Aprobada')
    
    S->>DB: UPDATE donaciones SET estado = 'Aprobada'
    
    Note over T: Trigger "trigger_crear_producto" se ejecuta
    
    T->>DB: Buscar o crear identidad en productos_donados
    
    alt Producto existe
        T->>DB: Reutilizar producto de catálogo sin modificar saldos
    else Producto no existe
        T->>DB: INSERT INTO productos_donados
    end
    
    T->>DB: INSERT entradas_inventario con donacion_id
    
    DB-->>S: Donación actualizada
    S-->>API: {success: true}
    API-->>O: Response 200
```

**Puntos clave:**
- El **trigger de PostgreSQL** hace todo el trabajo pesado
- **Previene duplicados** de entradas con `donacion_id`
- **Crea un lote independiente** aunque el producto de catálogo se repita
- **Garantiza consistencia** de datos

---

## Diagramas de Secuencia

### 🔐 Autenticación Completa

```mermaid
sequenceDiagram
    autonumber
    participant U as Usuario
    participant F as Formulario Login
    participant API as /api/auth/login
    participant AS as AuthService
    participant SB as Supabase Auth
    participant DB as PostgreSQL
    participant M as Middleware
    
    U->>F: Ingresa email y password
    U->>F: Clic en "Iniciar Sesión"
    F->>API: POST /api/auth/login
    
    API->>AS: authService.login(email, password)
    
    AS->>SB: signInWithPassword()
    SB->>DB: Verificar credenciales (auth.users)
    DB-->>SB: Usuario válido + token JWT
    SB-->>AS: {user, session}
    
    AS->>SB: Establecer cookies de sesión
    
    AS->>DB: SELECT * FROM usuarios WHERE id = ?
    DB-->>AS: {rol, estado, perfil_completo}
    
    alt Estado bloqueado o desactivado
        AS->>SB: signOut()
        AS-->>API: {success: false, error: 'blocked'}
    else Perfil incompleto
        AS-->>API: {success: true, redirect: '/perfil/completar'}
    else Todo OK
        AS-->>API: {success: true, redirect: '/[rol]/dashboard'}
    end
    
    API-->>F: Response con redirect
    F->>M: Navegar a dashboard
    M->>SB: Verificar sesión (cookies)
    SB-->>M: Sesión válida
    M->>DB: Verificar rol y estado
    DB-->>M: Usuario autorizado
    M-->>U: Mostrar dashboard
```

---

### 📧 Flujo de Notificaciones

```mermaid
sequenceDiagram
    participant E as Evento de negocio
    participant API as /api/notificaciones
    participant D as notificationEventDispatcher
    participant NS as NotificationService
    participant DB as notificaciones table
    participant U as Usuario (Frontend)
    
    E->>API: POST {event, entityId}
    API->>API: Validar sesión y perfil activo
    API->>D: Autorizar evento y consultar entidad
    D-->>API: titulo, mensaje, destinatario, metadata
    
    API->>NS: createNotification(input seguro)
    NS->>DB: INSERT INTO notificaciones
    NS->>DB: SELECT usuarios/preferencias para email
    
    Note over U: Frontend usa RPC y escucha realtime por contenido y estado del usuario
    U->>DB: RPC obtener_notificaciones_usuario(50)
    DB-->>U: Notificaciones visibles + leida calculada
    
    U->>U: Mostrar badge con contador
    U->>U: Usuario hace clic en notificación
    U->>DB: RPC marcar_notificacion_leida(id)
    DB-->>U: Success
```

`/api/notificaciones` no acepta `titulo`, `mensaje`, `destinatarioId`, `rolDestinatario`, `email`, `metadatos` ni `urlAccion` desde el cliente. El contrato público es `{ event, entityId }`. El hook de notificaciones carga mediante `obtener_notificaciones_usuario(50)`, que aplica la visibilidad y combina el estado desde `notificaciones_usuario`. Realtime escucha tres filtros de `notificaciones` (`destinatario_id`, rol y `TODOS`) y un filtro de `notificaciones_usuario` por `usuario_id`; el handler deduplica por `id` y actualiza el contador individual.

---

## Conclusión

### Resumen de Flujos Clave:

1. **Middleware (proxy.ts)** es la primera línea de defensa
   - Valida autenticación en TODAS las peticiones
   - Redirige según rol y estado
   - Centraliza la lógica de seguridad

2. **Services** encapsulan la lógica de negocio
   - Se reutilizan desde páginas y API routes
   - Implementan reglas de negocio complejas
   - Coordinan operaciones entre entidades

3. **Database Triggers** automatizan operaciones
   - Crean entradas de inventario automáticamente para donaciones
   - Crean notificaciones en tiempo real
   - Garantizan integridad de datos

4. **Row Level Security (RLS)** filtra datos
   - Se aplica automáticamente en cada query
   - Los usuarios solo ven lo que les corresponde
   - Seguridad a nivel de base de datos

Esta arquitectura garantiza:
- ✅ **Seguridad** en múltiples capas
- ✅ **Consistencia** de datos con triggers/RPC y compensación explícita en solicitudes
- ✅ **Trazabilidad** de todas las operaciones
- ✅ **Escalabilidad** con lógica modular
- ✅ **Mantenibilidad** con código organizado
