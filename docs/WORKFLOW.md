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
   - El sistema actualiza inventario automáticamente

2. **Aprobación de Solicitudes**
   - Ve solicitudes pendientes en `/operador/solicitudes`
   - Revisa detalles de la solicitud
   - Verifica disponibilidad en inventario
   - Aprueba o rechaza con motivo
   - Sistema descuenta inventario automáticamente si aprueba
   - Se genera comprobante con código único

3. **Control de Inventario**
   - Ve stock en tiempo real por depósito
   - Puede ajustar cantidades manualmente
   - Registra bajas de productos (vencidos, dañados)
   - Todos los movimientos se registran para trazabilidad

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
        Middleware->>Browser: Redirect a dashboard correcto
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
  
  // 3. Validar ruta pública
  if (RUTAS_PUBLICAS.includes(pathname)) {
    return NextResponse.next();
  }
  
  // 4. Verificar autenticación
  if (!user) {
    return NextResponse.redirect('/auth/iniciar-sesion');
  }
  
  // 5. Obtener perfil y validar rol
  const perfil = await obtenerPerfil(user.id);
  
  // 6. Validar autorización por rol
  if (pathname.startsWith('/admin') && perfil.rol !== 'ADMINISTRADOR') {
    return NextResponse.redirect(`/${perfil.rol.toLowerCase()}/dashboard`);
  }
  
  // 7. Permitir acceso
  return NextResponse.next();
}
```

**Puntos clave**:
- Se ejecuta ANTES de cualquier página o API route
- Tiene acceso a cookies de sesión
- Puede leer y modificar la request/response
- Realiza queries a la base de datos para validar roles

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
- **Estado actual**: La mayoría de páginas del proyecto usan `'use client'`
- **Acceso a servicios**: Las páginas cliente consumen hooks, servicios y API routes; las páginas servidor pueden usar clientes server-side
- **Oportunidad de mejora**: Migrar dashboards y vistas de solo lectura a Server Components para aprovechar caching, streaming y menor JavaScript en cliente

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
- **Testabilidad como objetivo**: Los servicios pueden probarse mejor si se separan dependencias externas y se agrega suite automatizada
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

El archivo `proxy.ts` es un **Middleware de Next.js** que intercepta TODAS las peticiones antes de que lleguen a su destino.

#### ¿Por qué se llama "proxy"?

El nombre puede ser confuso, pero hace referencia a que actúa como un **intermediario** entre el cliente y las páginas/API routes. No es un proxy inverso tradicional, sino un **middleware de autenticación**.

#### Funciones Principales:

```mermaid
graph TD
    A[Request entrante] --> B{Middleware proxy.ts}
    B --> C{¿Ruta pública?}
    C -->|Sí| D[Permitir acceso]
    C -->|No| E{¿Usuario autenticado?}
    E -->|No| F[Redirect a /auth/iniciar-sesion]
    E -->|Sí| G{¿Estado activo?}
    G -->|No| H[Cerrar sesión + Redirect]
    G -->|Sí| I{¿Rol autorizado?}
    I -->|No| J[Redirect a dashboard correcto]
    I -->|Sí| K[Permitir acceso]
    
    D --> L[Página/API Route]
    K --> L
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
    const esRutaPublica = RUTAS_PUBLICAS.some(ruta => pathname.startsWith(ruta));
    if (esRutaPublica) {
      return supabaseResponse;
    }

    // 6. Para rutas protegidas, verificar autenticación
    if (pathname.startsWith('/dashboard') || 
        pathname.startsWith('/admin') || 
        pathname.startsWith('/operador') || 
        pathname.startsWith('/donante') || 
        pathname.startsWith('/user')) {
      
      if (!isAuthenticated || !user) {
        // No autenticado, redirigir a login
        const url = new URL('/auth/iniciar-sesion', request.url);
        url.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(url);
      }

      // 7. Verificar el estado del usuario y autorización
      const { data: perfil } = await supabase
        .from('usuarios')
        .select('estado, rol')
        .eq('id', user.id)
        .single();

      if (perfil) {
        const { estado, rol } = perfil;
        
        // Validar estado
        if (estado === 'bloqueado' || estado === 'desactivado') {
          await supabase.auth.signOut();
          const url = new URL('/auth/iniciar-sesion', request.url);
          url.searchParams.set('error', estado === 'bloqueado' ? 'blocked' : 'deactivated');
          return NextResponse.redirect(url);
        }

        // 8. Verificar autorización por rol
        if (pathname.startsWith('/admin') && rol !== 'ADMINISTRADOR') {
          // Usuario no autorizado para /admin
          return NextResponse.redirect(
            new URL(`/${rol.toLowerCase()}/dashboard`, request.url)
          );
        }

        if (pathname.startsWith('/operador') && rol !== 'OPERADOR') {
          return NextResponse.redirect(
            new URL(`/${rol.toLowerCase()}/dashboard`, request.url)
          );
        }

        if (pathname.startsWith('/donante') && rol !== 'DONANTE') {
          return NextResponse.redirect(
            new URL(`/${rol.toLowerCase()}/dashboard`, request.url)
          );
        }

        if (pathname.startsWith('/user') && rol !== 'SOLICITANTE') {
          return NextResponse.redirect(
            new URL(`/${rol.toLowerCase()}/dashboard`, request.url)
          );
        }
      }
    }

    return supabaseResponse;
  } catch (error) {
    console.error('Error inesperado en middleware:', error);
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

1. **Se ejecuta en TODAS las peticiones** (excepto archivos estáticos)
2. **Tiene acceso a cookies** (donde Supabase guarda el token)
3. **Puede hacer queries a la BD** para obtener perfil del usuario
4. **Puede redirigir** antes de que la petición llegue a la página
5. **Centraliza la lógica de autenticación** (no se repite en cada página)

---

## Flujos de Negocio Principales

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
    participant NS as NotificationService
    
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
    
    S->>NS: Crear notificación para OPERADOR
    NS->>DB: INSERT INTO notificaciones
    
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
    participant NS as NotificationService
    
    O->>P: Ver solicitud pendiente
    O->>P: Clic en "Aprobar"
    P->>API: PATCH /api/solicitudes/123 {estado: 'aprobada'}
    
    API->>S: solicitudService.aprobar(solicitudId, operadorId)
    
    S->>IS: Verificar stock disponible
    IS->>DB: SELECT inventario WHERE producto = ?
    DB-->>IS: {cantidad_disponible: 50}
    IS-->>S: Stock suficiente
    
    S->>DB: BEGIN TRANSACTION
    
    S->>DB: UPDATE solicitudes SET estado = 'aprobada'
    
    Note over DB: Trigger automático se ejecuta
    DB->>DB: Descontar inventario
    DB->>DB: Registrar movimiento_inventario
    
    S->>DB: Generar código comprobante único
    S->>DB: UPDATE solicitudes SET codigo_comprobante = ?
    
    S->>DB: COMMIT TRANSACTION
    
    S->>NS: Crear notificación para beneficiario
    NS->>DB: INSERT INTO notificaciones
    
    S-->>API: {success: true, comprobante}
    API-->>P: Response 200
    P-->>O: Mostrar éxito + Comprobante generado
```

**Aspectos importantes:**
1. Todo ocurre en una **transacción** para garantizar consistencia
2. Los **triggers de la BD** se ejecutan automáticamente
3. El inventario se **descuenta automáticamente**
4. Se **genera un comprobante** con código único
5. Se envía **notificación** al beneficiario

---

### 📊 Flujo: Actualizar Inventario desde Donación Entregada

```mermaid
sequenceDiagram
    autonumber
    participant O as Operador
    participant API as API Route
    participant S as DonacionService
    participant DB as PostgreSQL
    participant T as Database Trigger
    
    O->>API: PATCH /api/donaciones/456 {estado: 'Entregada'}
    API->>S: donacionService.marcarComoEntregada(id)
    
    S->>DB: UPDATE donaciones SET estado = 'Entregada'
    
    Note over T: Trigger "trigger_crear_producto" se ejecuta
    
    T->>DB: Buscar producto existente con mismo nombre + unidad
    
    alt Producto existe
        T->>DB: UPDATE productos_donados SET cantidad += nueva_cantidad
    else Producto no existe
        T->>DB: INSERT INTO productos_donados
    end
    
    T->>DB: Buscar en inventario (producto + depósito)
    
    alt Ya existe en inventario
        T->>DB: UPDATE inventario SET cantidad_disponible += cantidad
    else No existe en inventario
        T->>DB: INSERT INTO inventario
    end
    
    DB-->>S: Donación actualizada
    S-->>API: {success: true}
    API-->>O: Response 200
```

**Puntos clave:**
- El **trigger de PostgreSQL** hace todo el trabajo pesado
- **Previene duplicados** de productos con normalización de nombres
- **Actualiza inventario automáticamente**
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
    participant E as Evento (ej: Nueva donación)
    participant T as Database Trigger
    participant F as Function crear_notificacion()
    participant DB as notificaciones table
    participant API as /api/notificaciones
    participant U as Usuario (Frontend)
    
    E->>T: INSERT INTO donaciones
    T->>F: Ejecutar trigger_notificacion_donacion()
    
    F->>F: Determinar destinatarios (rol: OPERADOR)
    
    F->>DB: INSERT INTO notificaciones (para cada operador)
    
    Note over U: Frontend hace polling cada 30s
    U->>API: GET /api/notificaciones
    API->>DB: SELECT notificaciones WHERE destinatario_id = ? AND leida = false
    DB-->>API: Lista de notificaciones
    API-->>U: Notificaciones no leídas
    
    U->>U: Mostrar badge con contador
    U->>U: Usuario hace clic en notificación
    U->>API: PATCH /api/notificaciones/[id] {leida: true}
    API->>DB: UPDATE notificaciones SET leida = true
    DB-->>API: Updated
    API-->>U: Success
```

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
   - Actualizan inventario automáticamente
   - Crean notificaciones en tiempo real
   - Garantizan integridad de datos

4. **Row Level Security (RLS)** filtra datos
   - Se aplica automáticamente en cada query
   - Los usuarios solo ven lo que les corresponde
   - Seguridad a nivel de base de datos

Esta arquitectura garantiza:
- ✅ **Seguridad** en múltiples capas
- ✅ **Consistencia** de datos con transacciones
- ✅ **Trazabilidad** de todas las operaciones
- ✅ **Escalabilidad** con lógica modular
- ✅ **Mantenibilidad** con código organizado
