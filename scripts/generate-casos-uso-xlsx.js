const ExcelJS = require('exceljs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'docs', 'Casos_De_Uso_Actualizado.xlsx');

const casos = [
  {
    id: 'CU-01',
    actor: 'Invitado / Usuario',
    caso: 'Registrar cuenta',
    objetivo: 'Crear una cuenta con rol definido.',
    precondiciones: 'No tener sesión activa.',
    flujoPrincipal: '1. Ingresa a registro. 2. Selecciona rol. 3. Digita correo y contraseña. 4. Envía el formulario. 5. El sistema crea la cuenta y confirma el registro.',
    alternos: 'Si las contraseñas no coinciden o faltan datos, el sistema muestra error.',
    postcondiciones: 'Cuenta creada y lista para verificación.',
    evidencia: 'src/app/auth/registrar/page.tsx',
    diagrama: 'Inicio -> Abrir registro -> Seleccionar rol -> Ingresar correo y contraseña -> Enviar formulario -> Validar datos -> Crear cuenta -> Confirmar registro -> Fin',
  },
  {
    id: 'CU-02',
    actor: 'Usuario autenticado',
    caso: 'Iniciar sesión',
    objetivo: 'Acceder al sistema según rol.',
    precondiciones: 'Tener cuenta activa y verificada.',
    flujoPrincipal: '1. Ingresa correo y contraseña. 2. Envía credenciales. 3. El sistema valida la sesión. 4. Redirige al dashboard correspondiente.',
    alternos: 'Si la cuenta está bloqueada, desactivada o el acceso es inválido, se muestra mensaje de error.',
    postcondiciones: 'Sesión iniciada.',
    evidencia: 'src/app/auth/iniciar-sesion/page.tsx; src/proxy.ts',
    diagrama: 'Inicio -> Abrir login -> Ingresar credenciales -> Enviar -> Validar sesión y estado -> Redirigir al dashboard -> Fin',
  },
  {
    id: 'CU-03',
    actor: 'Usuario autenticado',
    caso: 'Verificar correo',
    objetivo: 'Confirmar la dirección de email registrada.',
    precondiciones: 'Haber recibido el enlace de verificación.',
    flujoPrincipal: '1. Abre el enlace. 2. El sistema valida el token. 3. Se confirma la verificación.',
    alternos: 'Si el enlace es inválido o expiró, el sistema informa el error y permite reenviar.',
    postcondiciones: 'Correo verificado.',
    evidencia: 'src/app/auth/verificar-email/page.tsx',
    diagrama: 'Inicio -> Abrir enlace de verificación -> Validar token -> Confirmar email -> Mostrar éxito -> Fin',
  },
  {
    id: 'CU-04',
    actor: 'Usuario autenticado',
    caso: 'Restablecer contraseña',
    objetivo: 'Cambiar la contraseña desde un enlace de recuperación.',
    precondiciones: 'Tener un enlace válido de recuperación.',
    flujoPrincipal: '1. Abre el enlace. 2. Ingresa nueva contraseña. 3. Confirma contraseña. 4. Envía el formulario. 5. El sistema actualiza la clave.',
    alternos: 'Si la sesión no es válida o la confirmación falla, se muestra mensaje de error.',
    postcondiciones: 'Contraseña actualizada.',
    evidencia: 'src/app/auth/restablecer-contrasena/page.tsx',
    diagrama: 'Inicio -> Abrir enlace de recuperación -> Ingresar nueva contraseña -> Confirmar contraseña -> Enviar -> Actualizar clave -> Mostrar éxito -> Fin',
  },
  {
    id: 'CU-05',
    actor: 'Solicitante',
    caso: 'Completar perfil',
    objetivo: 'Registrar datos personales y ubicación.',
    precondiciones: 'Haber iniciado sesión.',
    flujoPrincipal: '1. Accede al perfil completo. 2. Ingresa datos personales. 3. Registra ubicación. 4. Guarda la información.',
    alternos: 'Si faltan datos o la ubicación no se puede obtener, el sistema muestra advertencia.',
    postcondiciones: 'Perfil completado.',
    evidencia: 'src/app/perfil/completar/page.tsx; src/app/user/perfil/page.tsx',
    diagrama: 'Inicio -> Abrir formulario de perfil -> Ingresar datos personales -> Registrar ubicación -> Guardar -> Validar y persistir -> Fin',
  },
  {
    id: 'CU-06',
    actor: 'Solicitante',
    caso: 'Enviar solicitud de alimentos',
    objetivo: 'Solicitar un alimento específico.',
    precondiciones: 'Perfil completo y sesión activa.',
    flujoPrincipal: '1. Busca alimento. 2. Selecciona unidad y cantidad. 3. Indica ubicación y comentarios. 4. El sistema valida stock. 5. Envía la solicitud.',
    alternos: 'Si no hay stock suficiente o faltan datos, la solicitud no se envía.',
    postcondiciones: 'Solicitud registrada en estado pendiente.',
    evidencia: 'src/app/user/formulario/page.tsx',
    diagrama: 'Inicio -> Buscar alimento -> Seleccionar producto y unidad -> Ingresar cantidad -> Registrar ubicación y comentarios -> Validar stock -> Enviar solicitud -> Fin',
  },
  {
    id: 'CU-07',
    actor: 'Solicitante',
    caso: 'Consultar solicitudes',
    objetivo: 'Ver el estado de sus solicitudes.',
    precondiciones: 'Tener solicitudes registradas.',
    flujoPrincipal: '1. Accede al historial. 2. Revisa estados y detalles. 3. Consulta comprobante si fue aprobada.',
    alternos: 'Si no existen solicitudes, se muestra estado vacío.',
    postcondiciones: 'Visualización de historial.',
    evidencia: 'src/app/user/solicitudes/page.tsx',
    diagrama: 'Inicio -> Abrir historial -> Cargar solicitudes -> Filtrar o revisar detalle -> Ver estado/comprobante -> Fin',
  },
  {
    id: 'CU-08',
    actor: 'Donante',
    caso: 'Registrar donación',
    objetivo: 'Ingresar una donación al sistema.',
    precondiciones: 'Sesión activa y perfil cargado.',
    flujoPrincipal: '1. Selecciona producto del catálogo o personalizado. 2. Ingresa cantidad, unidad y fechas. 3. Registra dirección y observaciones. 4. Envía la donación.',
    alternos: 'Si la fecha de disponibilidad es inválida o faltan datos, el sistema bloquea el envío.',
    postcondiciones: 'Donación registrada.',
    evidencia: 'src/app/donante/nueva-donacion/page.tsx',
    diagrama: 'Inicio -> Abrir nueva donación -> Seleccionar producto -> Ingresar cantidad y fechas -> Registrar logística -> Validar datos -> Enviar donación -> Fin',
  },
  {
    id: 'CU-09',
    actor: 'Donante',
    caso: 'Consultar historial de donaciones',
    objetivo: 'Ver estado y detalle de donaciones previas.',
    precondiciones: 'Tener donaciones registradas.',
    flujoPrincipal: '1. Entra al historial. 2. Filtra o busca registros. 3. Revisa el estado de cada donación.',
    alternos: 'Si no hay registros, se muestra mensaje informativo.',
    postcondiciones: 'Historial visualizado.',
    evidencia: 'src/app/donante/donaciones/page.tsx',
    diagrama: 'Inicio -> Abrir historial -> Cargar donaciones -> Filtrar/consultar detalle -> Revisar estado -> Fin',
  },
  {
    id: 'CU-10',
    actor: 'Operador',
    caso: 'Gestionar donaciones',
    objetivo: 'Cambiar el estado de donaciones recibidas.',
    precondiciones: 'Tener permisos de operador.',
    flujoPrincipal: '1. Visualiza donaciones. 2. Selecciona una. 3. Confirma cambio de estado. 4. El sistema actualiza el registro.',
    alternos: 'Puede cancelar una donación con motivo u observarla.',
    postcondiciones: 'Donación actualizada.',
    evidencia: 'src/app/operador/donaciones/page.tsx',
    diagrama: 'Inicio -> Abrir donaciones -> Seleccionar registro -> Confirmar cambio de estado -> Actualizar donación -> Registrar resultado -> Fin',
  },
  {
    id: 'CU-11',
    actor: 'Operador',
    caso: 'Gestionar solicitudes',
    objetivo: 'Aprobar, rechazar, revertir o entregar solicitudes.',
    precondiciones: 'Permiso de operador y stock disponible.',
    flujoPrincipal: '1. Selecciona solicitud. 2. Consulta inventario. 3. Aprueba o rechaza. 4. Si aplica, marca entregada con comprobante.',
    alternos: 'Si falta stock o comprobante, se detiene el proceso.',
    postcondiciones: 'Solicitud actualizada con trazabilidad.',
    evidencia: 'src/app/operador/solicitudes/page.tsx',
    diagrama: 'Inicio -> Abrir solicitudes -> Seleccionar solicitud -> Consultar inventario -> Aprobar o rechazar -> Registrar comentario/motivo -> Actualizar estado -> Fin',
  },
  {
    id: 'CU-12',
    actor: 'Operador',
    caso: 'Controlar inventario',
    objetivo: 'Consultar y ajustar el stock por depósito.',
    precondiciones: 'Inventario cargado.',
    flujoPrincipal: '1. Filtra inventario. 2. Consulta alertas y detalle. 3. Ajusta cantidades o da de baja productos.',
    alternos: 'Si hay error de carga, el sistema permite reintentar.',
    postcondiciones: 'Inventario actualizado.',
    evidencia: 'src/app/operador/inventario/page.tsx; src/app/operador/bajas/page.tsx',
    diagrama: 'Inicio -> Abrir inventario -> Filtrar bodega o producto -> Ajustar cantidad o dar baja -> Confirmar acción -> Registrar movimiento -> Fin',
  },
  {
    id: 'CU-13',
    actor: 'Administrador',
    caso: 'Gestionar catálogo de alimentos',
    objetivo: 'Crear, editar o eliminar alimentos y categorías.',
    precondiciones: 'Permiso de administrador.',
    flujoPrincipal: '1. Abre catálogo. 2. Crea o edita alimento. 3. Confirma eliminación si aplica. 4. El sistema actualiza catálogo.',
    alternos: 'Si el alimento está en uso, el sistema valida dependencias antes de borrar.',
    postcondiciones: 'Catálogo actualizado.',
    evidencia: 'src/app/admin/catalogo/page.tsx',
    diagrama: 'Inicio -> Abrir catálogo -> Crear/editar alimento -> Confirmar cambios o eliminación -> Validar dependencias -> Guardar -> Fin',
  },
  {
    id: 'CU-14',
    actor: 'Administrador',
    caso: 'Gestionar usuarios',
    objetivo: 'Cambiar rol y estado de cuentas.',
    precondiciones: 'Acceso de administrador.',
    flujoPrincipal: '1. Busca usuario. 2. Cambia rol o estado. 3. Confirma la acción. 4. El sistema registra el cambio.',
    alternos: 'Si se bloquea o desactiva, se solicita motivo o duración.',
    postcondiciones: 'Usuario actualizado.',
    evidencia: 'src/app/admin/usuarios/page.tsx',
    diagrama: 'Inicio -> Abrir usuarios -> Buscar usuario -> Cambiar rol/estado -> Definir motivo o duración -> Confirmar -> Guardar cambios -> Fin',
  },
  {
    id: 'CU-15',
    actor: 'Administrador',
    caso: 'Consultar reportes',
    objetivo: 'Revisar indicadores de donaciones, solicitudes, inventario y movimientos.',
    precondiciones: 'Sesión de administrador.',
    flujoPrincipal: '1. Abre módulo de reportes. 2. Aplica filtros. 3. Visualiza resultados. 4. Exporta o revisa detalle si es necesario.',
    alternos: 'Si no hay datos, el sistema muestra estado vacío o mensaje informativo.',
    postcondiciones: 'Reporte consultado.',
    evidencia: 'src/app/admin/reportes/donaciones/page.tsx; src/app/admin/reportes/solicitudes/page.tsx; src/app/admin/reportes/inventario/page.tsx; src/app/admin/reportes/movimientos/page.tsx',
    diagrama: 'Inicio -> Abrir reportes -> Seleccionar módulo -> Aplicar filtros -> Cargar resultados -> Revisar información -> Fin',
  },
  {
    id: 'CU-16',
    actor: 'Usuario autenticado',
    caso: 'Gestionar notificaciones',
    objetivo: 'Revisar, marcar o eliminar notificaciones.',
    precondiciones: 'Tener notificaciones disponibles.',
    flujoPrincipal: '1. Abre notificaciones. 2. Filtra por tipo/categoría. 3. Marca leídas o elimina seleccionadas.',
    alternos: 'Si no hay notificaciones, se muestra estado vacío.',
    postcondiciones: 'Notificaciones actualizadas.',
    evidencia: 'src/app/notificaciones/page.tsx; src/modules/shared/hooks/useNotificaciones.ts',
    diagrama: 'Inicio -> Abrir notificaciones -> Filtrar o seleccionar -> Marcar leídas o eliminar -> Actualizar estado -> Fin',
  },
];

function styleSheet(sheet) {
  sheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Actor', key: 'actor', width: 18 },
    { header: 'Caso de uso', key: 'caso', width: 28 },
    { header: 'Objetivo', key: 'objetivo', width: 28 },
    { header: 'Precondiciones', key: 'precondiciones', width: 24 },
    { header: 'Flujo principal', key: 'flujoPrincipal', width: 52 },
    { header: 'Flujos alternos', key: 'alternos', width: 40 },
    { header: 'Postcondiciones', key: 'postcondiciones', width: 24 },
    { header: 'Evidencia', key: 'evidencia', width: 58 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'I1' };

  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = rowNumber === 1 ? 24 : 46;
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      if (rowNumber > 1 && colNumber === 1) {
        cell.font = { bold: true };
      }
    });
  });
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OpenCode';
  workbook.created = new Date();
  workbook.modified = new Date();

  const resumen = workbook.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Tipo', key: 'tipo', width: 18 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Nota', key: 'nota', width: 70 },
  ];
  resumen.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  resumen.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  resumen.addRows([
    { tipo: 'Casos de uso', cantidad: casos.length, nota: 'Interacciones de usuarios derivadas del código real del sistema.' },
    { tipo: 'Actores', cantidad: 4, nota: 'Invitado/Usuario, Solicitante, Donante, Operador y Administrador.' },
  ]);
  resumen.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = rowNumber === 1 ? 22 : 28;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  });

  const casosSheet = workbook.addWorksheet('Casos de uso');
  styleSheet(casosSheet);
  casosSheet.addRows(casos);

  const diagramasSheet = workbook.addWorksheet('Diagramas textuales');
  diagramasSheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Caso de uso', key: 'caso', width: 28 },
    { header: 'Diagrama de flujo textual', key: 'diagrama', width: 110 },
  ];
  diagramasSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  diagramasSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  diagramasSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  diagramasSheet.views = [{ state: 'frozen', ySplit: 1 }];
  diagramasSheet.autoFilter = { from: 'A1', to: 'C1' };
  diagramasSheet.addRows(casos.map(({ id, caso, diagrama }) => ({ id, caso, diagrama })));
  diagramasSheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = rowNumber === 1 ? 22 : 34;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  });

  const actoresSheet = workbook.addWorksheet('Actores');
  actoresSheet.columns = [
    { header: 'Actor', key: 'actor', width: 22 },
    { header: 'Descripcion', key: 'descripcion', width: 70 },
    { header: 'Casos relacionados', key: 'casos', width: 60 },
  ];
  actoresSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  actoresSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  actoresSheet.addRows([
    { actor: 'Invitado / Usuario', descripcion: 'Persona sin sesión o en proceso de autenticación.', casos: 'CU-01, CU-02, CU-03, CU-04' },
    { actor: 'Solicitante', descripcion: 'Usuario beneficiario que solicita alimentos y revisa su perfil.', casos: 'CU-05, CU-06, CU-07, CU-16' },
    { actor: 'Donante', descripcion: 'Usuario que registra donaciones y revisa su historial.', casos: 'CU-08, CU-09' },
    { actor: 'Operador', descripcion: 'Usuario que gestiona donaciones, solicitudes, inventario y bajas.', casos: 'CU-10, CU-11, CU-12' },
    { actor: 'Administrador', descripcion: 'Usuario con control sobre catálogo, usuarios y reportes.', casos: 'CU-13, CU-14, CU-15' },
  ]);
  actoresSheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = rowNumber === 1 ? 22 : 28;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  });

  await workbook.xlsx.writeFile(outputPath);
  console.log(`Archivo generado: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
