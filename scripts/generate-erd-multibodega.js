const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const docsDir = path.join(__dirname, '..', 'docs');
const outputXlsx = path.join(docsDir, 'ERD_MultiBodega_Actualizado.xlsx');
const outputSvg = path.join(docsDir, 'ERD_MultiBodega.svg');
const outputPng = path.join(docsDir, 'ERD_MultiBodega.png');

const entidades = [
  {
    nombre: 'usuarios',
    descripcion: 'Usuarios del sistema con rol, estado y datos de contacto.',
    campos: 'id PK, rol, tipo_persona, nombre, email, estado, direccion',
  },
  {
    nombre: 'depositos',
    descripcion: 'Bodegas físicas donde se almacena inventario.',
    campos: 'id_deposito PK, nombre, descripcion',
  },
  {
    nombre: 'donante_depositos',
    descripcion: 'Tabla puente entre donantes y bodegas asignadas.',
    campos: 'id PK, donante_id FK, id_deposito FK, es_principal, activo, created_at',
  },
  {
    nombre: 'donaciones',
    descripcion: 'Registro de donaciones realizadas por usuarios donantes.',
    campos: 'id, user_id FK, tipo_producto, cantidad, unidad_id FK, alimento_id FK, estado',
  },
  {
    nombre: 'productos_donados',
    descripcion: 'Producto consolidado derivado de una donación aprobada.',
    campos: 'id_producto PK, id_usuario FK, nombre_producto, cantidad, unidad_id FK, fecha_donacion',
  },
  {
    nombre: 'inventario',
    descripcion: 'Stock disponible por depósito y producto.',
    campos: 'id_inventario PK, id_deposito FK, id_producto FK, cantidad_disponible, fecha_actualizacion',
  },
  {
    nombre: 'bajas_productos',
    descripcion: 'Registro de productos retirados del inventario.',
    campos: 'id_baja PK, id_producto FK, id_inventario FK, usuario_responsable_id FK, cantidad_baja, motivo_baja',
  },
  {
    nombre: 'solicitudes',
    descripcion: 'Pedidos de alimentos realizados por beneficiarios.',
    campos: 'id PK, usuario_id FK, tipo_alimento, cantidad, unidad_id FK, estado, codigo_comprobante',
  },
  {
    nombre: 'movimiento_inventario_cabecera',
    descripcion: 'Cabecera de trazabilidad de movimientos entre actores.',
    campos: 'id_movimiento PK, id_donante FK, id_solicitante FK, estado_movimiento, fecha_movimiento',
  },
  {
    nombre: 'movimiento_inventario_detalle',
    descripcion: 'Líneas de detalle por producto y cantidad en cada movimiento.',
    campos: 'id_detalle PK, id_movimiento FK, id_producto FK, unidad_id FK, cantidad, tipo_transaccion',
  },
  {
    nombre: 'notificaciones',
    descripcion: 'Mensajes automáticos generados por eventos del sistema.',
    campos: 'id PK, destinatario_id FK, titulo, mensaje, tipo, categoria, leida',
  },
];

const relaciones = [
  ['usuarios', 'donaciones', '1:N', 'Crea donaciones'],
  ['usuarios', 'solicitudes', '1:N', 'Realiza solicitudes'],
  ['usuarios', 'productos_donados', '1:N', 'Registra productos'],
  ['usuarios', 'notificaciones', '1:N', 'Recibe notificaciones'],
  ['usuarios', 'bajas_productos', '1:N', 'Registra bajas'],
  ['usuarios', 'donante_depositos', '1:N', 'Es donante asignado'],
  ['depositos', 'donante_depositos', '1:N', 'Se asigna a donantes'],
  ['donante_depositos', 'depositos', 'N:1', 'Mapea donante a bodega'],
  ['donaciones', 'productos_donados', '1:1/1:N', 'Genera o consolida producto'],
  ['donaciones', 'inventario', '1:N', 'Incrementa stock al aprobarse'],
  ['productos_donados', 'inventario', '1:N', 'Se almacena por depósito'],
  ['depositos', 'inventario', '1:N', 'Contiene inventario'],
  ['inventario', 'bajas_productos', '1:N', 'Puede generar bajas'],
  ['solicitudes', 'movimiento_inventario_cabecera', '1:N', 'Origen de movimientos'],
  ['movimiento_inventario_cabecera', 'movimiento_inventario_detalle', '1:N', 'Contiene líneas'],
  ['productos_donados', 'movimiento_inventario_detalle', '1:N', 'Participa en movimiento'],
];

function styleTable(sheet, endColumn) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${endColumn}1` };
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
    });
  });
}

function svg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1300" viewBox="0 0 2000 1300">
  <defs>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L12,6 L0,12 z" fill="#334155" />
    </marker>
    <style>
      .title { font: 700 36px Arial, sans-serif; fill: #0f172a; }
      .subtitle { font: 400 18px Arial, sans-serif; fill: #475569; }
      .boxTitle { font: 700 20px Arial, sans-serif; fill: #0f172a; }
      .boxText { font: 400 15px Arial, sans-serif; fill: #1e293b; }
      .label { font: 700 14px Arial, sans-serif; fill: #334155; }
      .card { rx: 18; ry: 18; stroke-width: 2.5; }
    </style>
  </defs>

  <rect width="2000" height="1300" fill="#f8fafc" />
  <text x="70" y="70" class="title">Diagrama Entidad-Relación: arquitectura multi-bodega</text>
  <text x="70" y="104" class="subtitle">Modelo enfocado en bodegas externas dispersas, trazabilidad y consolidación de inventario</text>

  <rect x="80" y="160" width="250" height="110" fill="#dbeafe" stroke="#2563eb" class="card" />
  <text x="205" y="202" text-anchor="middle" class="boxTitle">usuarios</text>
  <text x="205" y="232" text-anchor="middle" class="boxText">Donantes, solicitantes, operadores, administradores</text>

  <rect x="80" y="340" width="250" height="100" fill="#ede9fe" stroke="#7c3aed" class="card" />
  <text x="205" y="380" text-anchor="middle" class="boxTitle">donante_depositos</text>
  <text x="205" y="408" text-anchor="middle" class="boxText">Tabla puente donante -> bodega</text>

  <rect x="80" y="520" width="250" height="100" fill="#dcfce7" stroke="#16a34a" class="card" />
  <text x="205" y="560" text-anchor="middle" class="boxTitle">depositos</text>
  <text x="205" y="588" text-anchor="middle" class="boxText">Bodegas externas dispersas</text>

  <rect x="80" y="700" width="250" height="110" fill="#fef3c7" stroke="#d97706" class="card" />
  <text x="205" y="742" text-anchor="middle" class="boxTitle">donaciones</text>
  <text x="205" y="772" text-anchor="middle" class="boxText">Donación registrada por donante</text>

  <rect x="80" y="880" width="250" height="110" fill="#fee2e2" stroke="#dc2626" class="card" />
  <text x="205" y="922" text-anchor="middle" class="boxTitle">productos_donados</text>
  <text x="205" y="952" text-anchor="middle" class="boxText">Producto consolidado aprobado</text>

  <rect x="500" y="350" width="300" height="150" fill="#e0f2fe" stroke="#0284c7" class="card" />
  <text x="650" y="392" text-anchor="middle" class="boxTitle">inventario</text>
  <text x="650" y="424" text-anchor="middle" class="boxText">Cantidad por depósito y producto</text>
  <text x="650" y="452" text-anchor="middle" class="boxText">Clave única: id_deposito + id_producto</text>

  <rect x="500" y="610" width="300" height="120" fill="#fae8ff" stroke="#c026d3" class="card" />
  <text x="650" y="650" text-anchor="middle" class="boxTitle">bajas_productos</text>
  <text x="650" y="680" text-anchor="middle" class="boxText">Retiro por vencimiento o daño</text>

  <rect x="920" y="150" width="300" height="120" fill="#dbeafe" stroke="#1d4ed8" class="card" />
  <text x="1070" y="192" text-anchor="middle" class="boxTitle">solicitudes</text>
  <text x="1070" y="222" text-anchor="middle" class="boxText">Pedidos de beneficiarios</text>

  <rect x="920" y="360" width="300" height="120" fill="#fde68a" stroke="#ca8a04" class="card" />
  <text x="1070" y="402" text-anchor="middle" class="boxTitle">movimiento_inventario_cabecera</text>
  <text x="1070" y="432" text-anchor="middle" class="boxText">Encabezado del movimiento</text>

  <rect x="920" y="570" width="300" height="120" fill="#c7d2fe" stroke="#4338ca" class="card" />
  <text x="1070" y="612" text-anchor="middle" class="boxTitle">movimiento_inventario_detalle</text>
  <text x="1070" y="642" text-anchor="middle" class="boxText">Detalle por producto y cantidad</text>

  <rect x="920" y="790" width="300" height="110" fill="#ccfbf1" stroke="#0f766e" class="card" />
  <text x="1070" y="832" text-anchor="middle" class="boxTitle">notificaciones</text>
  <text x="1070" y="862" text-anchor="middle" class="boxText">Alertas automáticas del sistema</text>

  <line x1="330" y1="215" x2="500" y2="400" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="392" y="300" class="label">1:N</text>

  <line x1="330" y1="400" x2="500" y2="560" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="395" y="482" class="label">N:1</text>

  <line x1="330" y1="560" x2="500" y2="410" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="392" y="512" class="label">1:N</text>

  <line x1="330" y1="760" x2="500" y2="420" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="395" y="615" class="label">Aprobación</text>

  <line x1="330" y1="930" x2="500" y2="405" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="392" y="705" class="label">Genera stock</text>

  <line x1="330" y1="930" x2="500" y2="660" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="390" y="842" class="label">1:N</text>

  <line x1="800" y1="415" x2="920" y2="210" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="846" y="300" class="label">solicita</text>

  <line x1="800" y1="420" x2="920" y2="420" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="850" y="398" class="label">1:N</text>

  <line x1="800" y1="420" x2="920" y2="620" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="845" y="540" class="label">1:N</text>

  <line x1="650" y1="500" x2="650" y2="610" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="670" y="560" class="label">1:N</text>

  <line x1="800" y1="420" x2="920" y2="835" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="850" y="700" class="label">notifica</text>

  <rect x="1380" y="180" width="520" height="930" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="20" ry="20" />
  <text x="1640" y="225" text-anchor="middle" class="boxTitle">Relaciones clave para multi-bodega</text>
  <text x="1400" y="270" class="boxText">1. usuarios 1:N donaciones</text>
  <text x="1400" y="305" class="boxText">2. usuarios 1:N solicitudes</text>
  <text x="1400" y="340" class="boxText">3. usuarios 1:N productos_donados</text>
  <text x="1400" y="375" class="boxText">4. usuarios 1:N notificaciones</text>
  <text x="1400" y="410" class="boxText">5. usuarios 1:N bajas_productos</text>
  <text x="1400" y="445" class="boxText">6. usuarios 1:N donante_depositos</text>
  <text x="1400" y="480" class="boxText">7. depositos 1:N donante_depositos</text>
  <text x="1400" y="515" class="boxText">8. depositos 1:N inventario</text>
  <text x="1400" y="550" class="boxText">9. productos_donados 1:N inventario</text>
  <text x="1400" y="585" class="boxText">10. inventario 1:N bajas_productos</text>
  <text x="1400" y="620" class="boxText">11. solicitudes 1:N movimiento_inventario_cabecera</text>
  <text x="1400" y="655" class="boxText">12. movimiento_inventario_cabecera 1:N detalle</text>
  <text x="1400" y="690" class="boxText">13. productos_donados 1:N movimiento_inventario_detalle</text>
  <text x="1400" y="725" class="boxText">14. donante_depositos define bodega principal por donante</text>
  <text x="1400" y="760" class="boxText">15. donaciones aprobadas alimentan el inventario del depósito asignado</text>
  <text x="1400" y="795" class="boxText">16. la clave única inventario(id_deposito,id_producto) evita duplicidad por bodega</text>
  <text x="1400" y="830" class="boxText">17. el trigger de donaciones consolida producto y stock</text>
  <text x="1400" y="865" class="boxText">18. el mapeo donante-bodega permite bodegas externas dispersas</text>
  <text x="1400" y="900" class="boxText">19. las bajas registran retiro físico desde una bodega específica</text>
  <text x="1400" y="935" class="boxText">20. las notificaciones informan cambios de estado y trazabilidad</text>
</svg>`;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpenCode';
  wb.created = new Date();
  wb.modified = new Date();

  const erd = wb.addWorksheet('ERD');
  erd.columns = [
    { header: 'Entidad', key: 'nombre', width: 24 },
    { header: 'Descripcion', key: 'descripcion', width: 48 },
    { header: 'Campos clave', key: 'campos', width: 56 },
  ];
  erd.addRows(entidades);
  styleTable(erd, 'C');

  const rel = wb.addWorksheet('Relaciones');
  rel.columns = [
    { header: 'Origen', key: 'origen', width: 24 },
    { header: 'Destino', key: 'destino', width: 24 },
    { header: 'Cardinalidad', key: 'card', width: 14 },
    { header: 'Descripcion', key: 'descripcion', width: 54 },
  ];
  rel.addRows(relaciones.map(([origen, destino, card, descripcion]) => ({ origen, destino, card, descripcion })));
  styleTable(rel, 'D');

  const multi = wb.addWorksheet('Multi-Bodega');
  multi.columns = [
    { header: 'Elemento', key: 'elemento', width: 24 },
    { header: 'Rol en la logica multi-bodega', key: 'rol', width: 76 },
  ];
  multi.addRows([
    { elemento: 'donante_depositos', rol: 'Asigna una o varias bodegas a cada donante y define la bodega principal activa.' },
    { elemento: 'depositos', rol: 'Representa bodegas externas dispersas donde se almacena inventario.' },
    { elemento: 'inventario', rol: 'Guarda stock por depósito y producto con unicidad por combinación.' },
    { elemento: 'crear_producto_desde_donacion', rol: 'Trigger que consolida producto e incrementa inventario en la bodega asignada.' },
    { elemento: 'dar_baja_producto', rol: 'Función que descuenta stock en una bodega específica y registra la baja.' },
    { elemento: 'auditoria', rol: 'Consultas de verificación para detectar mezcla de donantes o bodega incorrecta.' },
  ]);
  styleTable(multi, 'B');

  await wb.xlsx.writeFile(outputXlsx);
  fs.writeFileSync(outputSvg, svg(), 'utf8');

  try {
    execFileSync('magick', [outputSvg, outputPng]);
  } catch (err1) {
    try {
      execFileSync('convert', [outputSvg, outputPng]);
    } catch (err2) {
      console.error('No se pudo convertir SVG a PNG. El SVG quedó generado.');
    }
  }

  console.log(`Archivo generado: ${outputXlsx}`);
  console.log(`Imagen generada: ${outputSvg}`);
  if (fs.existsSync(outputPng)) {
    console.log(`Imagen generada: ${outputPng}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
