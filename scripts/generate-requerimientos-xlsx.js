const ExcelJS = require('exceljs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'docs', 'Matriz_Requerimientos_Actualizada.xlsx');

const rfRows = [
  ['RF-01', 'Registrar usuario con rol', 'Permite crear una cuenta seleccionando el tipo de usuario.', 'Implementado', 'src/app/auth/registrar/page.tsx'],
  ['RF-02', 'Iniciar sesión', 'Permite autenticar al usuario con correo y contraseña.', 'Implementado', 'src/app/auth/iniciar-sesion/page.tsx'],
  ['RF-03', 'Verificar correo', 'Confirma la cuenta mediante un enlace enviado al email.', 'Implementado', 'src/app/auth/verificar-email/page.tsx'],
  ['RF-04', 'Reenviar verificación', 'Permite solicitar nuevamente el correo de verificación.', 'Implementado', 'src/app/auth/verificar-email/page.tsx'],
  ['RF-05', 'Recuperar contraseña', 'Envía un enlace para iniciar el proceso de recuperación.', 'Implementado', 'src/app/auth/olvide-contrasena/page.tsx'],
  ['RF-06', 'Restablecer contraseña', 'Permite definir una nueva contraseña desde el enlace recibido.', 'Implementado', 'src/app/auth/restablecer-contrasena/page.tsx'],
  ['RF-07', 'Control de acceso por rol', 'Restringe rutas y redirige según el rol del usuario.', 'Implementado', 'src/proxy.ts; src/app/components/DashboardLayout.tsx'],
  ['RF-08', 'Completar/consultar perfil de usuario', 'Muestra y completa los datos básicos del perfil.', 'Implementado', 'src/app/user/perfil/page.tsx; src/app/perfil/completar/page.tsx'],
  ['RF-09', 'Actualizar perfil', 'Permite modificar la información personal registrada.', 'Implementado', 'src/app/perfil/actualizar/page.tsx'],
  ['RF-10', 'Configurar preferencias de usuario', 'Gestiona preferencias y opciones de seguridad.', 'Implementado', 'src/app/user/configuracion/page.tsx; src/modules/shared/hooks/useUserPreferences.ts'],
  ['RF-11', 'Crear solicitud de alimentos', 'Registra una solicitud con producto, cantidad y ubicación.', 'Implementado', 'src/app/user/formulario/page.tsx'],
  ['RF-12', 'Validar stock antes de solicitar', 'Verifica disponibilidad antes de enviar la solicitud.', 'Implementado', 'src/app/user/formulario/page.tsx; src/modules/user/hooks/useInventoryStock.ts'],
  ['RF-13', 'Consultar historial de solicitudes del beneficiario', 'Permite revisar solicitudes enviadas y sus estados.', 'Implementado', 'src/app/user/solicitudes/page.tsx'],
  ['RF-14', 'Crear donación', 'Registra una donación con sus datos logísticos y de producto.', 'Implementado', 'src/app/donante/nueva-donacion/page.tsx'],
  ['RF-15', 'Seleccionar alimento catálogo o personalizado', 'Permite elegir un alimento existente o crear uno nuevo.', 'Implementado', 'src/app/donante/nueva-donacion/page.tsx'],
  ['RF-16', 'Calcular impacto social de donación', 'Estima personas alimentadas y equivalencias de comida.', 'Implementado', 'src/app/donante/nueva-donacion/page.tsx; calcularImpacto'],
  ['RF-17', 'Ver historial de donaciones del donante', 'Muestra el listado y seguimiento de donaciones realizadas.', 'Implementado', 'src/app/donante/donaciones/page.tsx'],
  ['RF-18', 'Gestionar donaciones como operador', 'Actualiza estados y seguimiento de donaciones recibidas.', 'Implementado', 'src/app/operador/donaciones/page.tsx'],
  ['RF-19', 'Gestionar solicitudes como operador', 'Revisa, aprueba, rechaza y procesa solicitudes.', 'Implementado', 'src/app/operador/solicitudes/page.tsx'],
  ['RF-20', 'Aprobar/rechazar solicitudes', 'Permite decidir el estado de una solicitud con motivo.', 'Implementado', 'src/app/operador/solicitudes/page.tsx'],
  ['RF-21', 'Marcar solicitud como entregada con comprobante', 'Cierra la solicitud usando el código de comprobante.', 'Implementado', 'src/app/operador/solicitudes/page.tsx; src/app/comprobante/[codigo]/page.tsx'],
  ['RF-22', 'Controlar inventario por depósitos', 'Visualiza stock por bodega y sus alertas.', 'Implementado', 'src/app/operador/inventario/page.tsx'],
  ['RF-23', 'Ajustar cantidades de inventario', 'Incrementa o reduce existencias manualmente.', 'Implementado', 'src/app/operador/inventario/page.tsx'],
  ['RF-24', 'Registrar bajas de productos e historial', 'Consulta y registra productos dados de baja.', 'Implementado', 'src/app/operador/bajas/page.tsx'],
  ['RF-25', 'Ver notificaciones', 'Lista notificaciones por tipo, categoría y estado.', 'Implementado', 'src/app/notificaciones/page.tsx'],
  ['RF-26', 'Marcar/eliminar notificaciones', 'Gestiona notificaciones individual o masivamente.', 'Implementado', 'src/app/notificaciones/page.tsx; src/modules/shared/hooks/useNotificaciones.ts'],
  ['RF-27', 'Gestionar catálogo de alimentos', 'Administra alimentos y categorías del sistema.', 'Implementado', 'src/app/admin/catalogo/page.tsx'],
  ['RF-28', 'Gestionar usuarios y estados', 'Modifica rol, bloqueo, activación y desactivación.', 'Implementado', 'src/app/admin/usuarios/page.tsx'],
  ['RF-29', 'Generar reportes de donaciones', 'Consulta y filtra reportes de donaciones.', 'Implementado', 'src/app/admin/reportes/donaciones/page.tsx'],
  ['RF-30', 'Generar reportes de solicitudes', 'Consulta y filtra reportes de solicitudes.', 'Implementado', 'src/app/admin/reportes/solicitudes/page.tsx'],
  ['RF-31', 'Generar reportes de inventario', 'Consulta el estado histórico del inventario.', 'Implementado', 'src/app/admin/reportes/inventario/page.tsx'],
  ['RF-32', 'Generar reportes de movimientos', 'Visualiza movimientos registrados del inventario.', 'Implementado', 'src/app/admin/reportes/movimientos/page.tsx'],
  ['RF-33', 'Cancelar donaciones', 'Permite cancelar una donación con motivo y observación.', 'Implementado', 'src/app/admin/reportes/donaciones/page.tsx; src/app/operador/donaciones/page.tsx'],
];

const rnfRows = [
  ['RNF-01', 'Autenticación segura con Supabase Auth', 'Protege el acceso mediante sesión autenticada.', 'Implementado', 'src/app/components/SupabaseProvider.tsx; src/proxy.ts'],
  ['RNF-02', 'Autorización por roles en cliente y middleware', 'Restringe vistas y rutas según permisos.', 'Implementado', 'src/app/components/DashboardLayout.tsx; src/proxy.ts'],
  ['RNF-03', 'Cierre de sesión por inactividad', 'Finaliza la sesión tras un periodo sin actividad.', 'Implementado', 'src/app/components/SupabaseProvider.tsx'],
  ['RNF-04', 'Seguridad por RLS en base de datos', 'Limita acceso a registros desde la base de datos.', 'Soportado por arquitectura', 'README.md; docs/ARCHITECTURE.md'],
  ['RNF-05', 'Persistencia y trazabilidad de acciones críticas', 'Registra cambios de estado y operaciones sensibles.', 'Implementado', 'módulos de inventario, solicitudes, donaciones y notificaciones'],
  ['RNF-06', 'Manejo de errores y estados de carga', 'Informa carga, éxito y fallo de operaciones.', 'Implementado', 'múltiples páginas y hooks'],
  ['RNF-07', 'Arquitectura modular por dominio', 'Organiza el sistema por módulos de negocio.', 'Implementado', 'src/modules/*; docs/ARCHITECTURE.md'],
  ['RNF-08', 'Interfaz responsive', 'Adapta la UI a distintos tamaños de pantalla.', 'Implementado', 'src/app/components/DashboardLayout.tsx; páginas responsivas'],
  ['RNF-09', 'Reutilización de componentes UI', 'Evita duplicación usando componentes compartidos.', 'Implementado', 'src/app/components/*; modules/shared/components/*'],
  ['RNF-10', 'Integración con servicios externos', 'Consume servicios de identidad, correo y mapas.', 'Implementado', 'validación identidad, email, Mapbox'],
  ['RNF-11', 'Usabilidad con confirmaciones para acciones críticas', 'Previene acciones accidentales mediante confirmación.', 'Implementado', 'useConfirm; modales de aprobación/rechazo'],
  ['RNF-12', 'Rendimiento con SSR/Next.js App Router', 'Mejora carga inicial y renderizado.', 'Implementado', 'README.md; docs/ARCHITECTURE.md'],
  ['RNF-13', 'Tipado fuerte con TypeScript', 'Reduce errores y mejora mantenimiento.', 'Implementado', 'todo el proyecto'],
  ['RNF-14', 'Escalabilidad por separación UI/lógica/datos', 'Facilita ampliar el sistema sin acoplar capas.', 'Implementado', 'app/; modules/; lib/'],
  ['RNF-15', 'Accesibilidad básica en controles y navegación', 'Mantiene uso claro de formularios y botones.', 'Parcial', 'layouts y formularios'],
  ['RNF-16', 'Consistencia de datos mediante validaciones de formulario', 'Evita envíos incompletos o inválidos.', 'Implementado', 'formularios de auth, donación, solicitud, inventario'],
  ['RNF-17', 'Auditoría de movimientos y estados', 'Permite rastrear operaciones del sistema.', 'Implementado', 'solicitudes, donaciones, inventario, bajas, notificaciones'],
  ['RNF-18', 'Compatibilidad con navegadores modernos', 'Funciona en entornos web actuales.', 'Soportado', 'stack Next.js/Tailwind'],
];

function styleSheet(sheet) {
  sheet.columns = [
    { header: 'ID', key: 'id', width: 12 },
    { header: 'Requerimiento', key: 'requerimiento', width: 42 },
    { header: 'Descripcion breve', key: 'descripcion', width: 52 },
    { header: 'Estado', key: 'estado', width: 22 },
    { header: 'Evidencia', key: 'evidencia', width: 60 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'E1' };

  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = rowNumber === 1 ? 22 : 34;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      if (rowNumber > 1 && cell.col === 4) {
        const value = String(cell.value || '');
        const fillMap = {
          Implementado: 'FFD1FAE5',
          'Soportado por arquitectura': 'FFDBEAFE',
          Parcial: 'FFFEF3C7',
          Soportado: 'FFE0E7FF',
        };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillMap[value] || 'FFF3F4F6' } };
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
    { header: 'Nota', key: 'nota', width: 60 },
  ];
  resumen.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  resumen.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  resumen.addRows([
    { tipo: 'RF', cantidad: rfRows.length, nota: 'Requerimientos funcionales detectados desde pantallas y servicios.' },
    { tipo: 'RNF', cantidad: rnfRows.length, nota: 'Requerimientos no funcionales inferidos desde arquitectura y código.' },
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

  const rfSheet = workbook.addWorksheet('RF');
  styleSheet(rfSheet);
  rfSheet.addRows(rfRows.map(([id, requerimiento, descripcion, estado, evidencia]) => ({ id, requerimiento, descripcion, estado, evidencia })));

  const rnfSheet = workbook.addWorksheet('RNF');
  styleSheet(rnfSheet);
  rnfSheet.addRows(rnfRows.map(([id, requerimiento, descripcion, estado, evidencia]) => ({ id, requerimiento, descripcion, estado, evidencia })));

  await workbook.xlsx.writeFile(outputPath);
  console.log(`Archivo generado: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
