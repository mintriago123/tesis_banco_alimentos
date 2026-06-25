const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const docsDir = path.join(__dirname, '..', 'docs');
const outputXlsx = path.join(docsDir, 'ERD_MultiBodega_Estetico.xlsx');
const outputSvg = path.join(docsDir, 'ERD_MultiBodega_Estetico.svg');
const outputPng = path.join(docsDir, 'ERD_MultiBodega_Estetico.png');

const entidades = [
  ['usuarios', 'Usuarios del sistema con rol, estado y datos de contacto.', 'id PK, rol, tipo_persona, nombre, email, estado, direccion'],
  ['depositos', 'Bodegas físicas donde se almacena inventario.', 'id_deposito PK, nombre, descripcion'],
  ['donante_depositos', 'Tabla puente entre donantes y bodegas asignadas.', 'id PK, donante_id FK, id_deposito FK, es_principal, activo, created_at'],
  ['donaciones', 'Registro de donaciones realizadas por usuarios donantes.', 'id, user_id FK, tipo_producto, cantidad, unidad_id FK, alimento_id FK, estado'],
  ['productos_donados', 'Producto consolidado derivado de una donación aprobada.', 'id_producto PK, id_usuario FK, nombre_producto, cantidad, unidad_id FK, fecha_donacion'],
  ['inventario', 'Stock disponible por depósito y producto.', 'id_inventario PK, id_deposito FK, id_producto FK, cantidad_disponible, fecha_actualizacion'],
  ['bajas_productos', 'Registro de productos retirados del inventario.', 'id_baja PK, id_producto FK, id_inventario FK, usuario_responsable_id FK, cantidad_baja, motivo_baja'],
  ['solicitudes', 'Pedidos de alimentos realizados por beneficiarios.', 'id PK, usuario_id FK, tipo_alimento, cantidad, unidad_id FK, estado, codigo_comprobante'],
  ['movimiento_inventario_cabecera', 'Cabecera de trazabilidad de movimientos entre actores.', 'id_movimiento PK, id_donante FK, id_solicitante FK, estado_movimiento, fecha_movimiento'],
  ['movimiento_inventario_detalle', 'Líneas de detalle por producto y cantidad en cada movimiento.', 'id_detalle PK, id_movimiento FK, id_producto FK, unidad_id FK, cantidad, tipo_transaccion'],
  ['notificaciones', 'Mensajes automáticos generados por eventos del sistema.', 'id PK, destinatario_id FK, titulo, mensaje, tipo, categoria, leida'],
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

function setTableStyle(sheet, endColumn) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${endColumn}1` };
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = rowNumber === 1 ? 24 : 32;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      if (rowNumber > 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
      }
    });
  });
}

function buildSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="2100" height="1450" viewBox="0 0 2100 1450">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#eff6ff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
    <linearGradient id="header" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L12,6 L0,12 z" fill="#334155" />
    </marker>
    <style>
      .title { font: 700 36px Arial, sans-serif; fill: #ffffff; }
      .subtitle { font: 400 18px Arial, sans-serif; fill: #dbeafe; }
      .boxTitle { font: 700 20px Arial, sans-serif; fill: #0f172a; }
      .boxText { font: 400 15px Arial, sans-serif; fill: #1e293b; }
      .label { font: 700 14px Arial, sans-serif; fill: #334155; }
      .card { rx: 18; ry: 18; stroke-width: 2.5; }
    </style>
  </defs>

  <rect width="2100" height="1450" fill="url(#bg)" />
  <rect x="40" y="30" width="2020" height="110" rx="28" ry="28" fill="url(#header)" />
  <text x="80" y="78" class="title">Diagrama Entidad-Relación: arquitectura multi-bodega</text>
  <text x="80" y="112" class="subtitle">Modelo para bodegas externas dispersas, trazabilidad y consolidación de inventario</text>

  <rect x="70" y="170" width="240" height="100" fill="#dbeafe" stroke="#2563eb" class="card" />
  <text x="190" y="210" text-anchor="middle" class="boxTitle">usuarios</text>
  <text x="190" y="238" text-anchor="middle" class="boxText">Donantes, solicitantes, operadores, admin.</text>

  <rect x="70" y="315" width="240" height="90" fill="#ede9fe" stroke="#7c3aed" class="card" />
  <text x="190" y="350" text-anchor="middle" class="boxTitle">donante_depositos</text>
  <text x="190" y="377" text-anchor="middle" class="boxText">Puente donante -> bodega</text>

  <rect x="70" y="455" width="240" height="90" fill="#dcfce7" stroke="#16a34a" class="card" />
  <text x="190" y="490" text-anchor="middle" class="boxTitle">depositos</text>
  <text x="190" y="517" text-anchor="middle" class="boxText">Bodegas externas dispersas</text>

  <rect x="70" y="595" width="240" height="100" fill="#fef3c7" stroke="#d97706" class="card" />
  <text x="190" y="635" text-anchor="middle" class="boxTitle">donaciones</text>
  <text x="190" y="662" text-anchor="middle" class="boxText">Donaciones registradas</text>

  <rect x="70" y="750" width="240" height="100" fill="#fee2e2" stroke="#dc2626" class="card" />
  <text x="190" y="790" text-anchor="middle" class="boxTitle">productos_donados</text>
  <text x="190" y="817" text-anchor="middle" class="boxText">Producto consolidado aprobado</text>

  <rect x="70" y="905" width="240" height="100" fill="#fae8ff" stroke="#c026d3" class="card" />
  <text x="190" y="945" text-anchor="middle" class="boxTitle">bajas_productos</text>
  <text x="190" y="972" text-anchor="middle" class="boxText">Retiro por daño o vencimiento</text>

  <rect x="420" y="270" width="300" height="145" fill="#e0f2fe" stroke="#0284c7" class="card" />
  <text x="570" y="312" text-anchor="middle" class="boxTitle">inventario</text>
  <text x="570" y="340" text-anchor="middle" class="boxText">Stock por depósito y producto</text>
  <text x="570" y="368" text-anchor="middle" class="boxText">Clave única id_deposito + id_producto</text>

  <rect x="420" y="505" width="300" height="120" fill="#c7d2fe" stroke="#4338ca" class="card" />
  <text x="570" y="548" text-anchor="middle" class="boxTitle">solicitudes</text>
  <text x="570" y="578" text-anchor="middle" class="boxText">Pedidos de beneficiarios</text>

  <rect x="420" y="700" width="300" height="120" fill="#fcd34d" stroke="#b45309" class="card" />
  <text x="570" y="742" text-anchor="middle" class="boxTitle">movimiento_inventario_cabecera</text>
  <text x="570" y="772" text-anchor="middle" class="boxText">Encabezado del movimiento</text>

  <rect x="420" y="900" width="300" height="120" fill="#bae6fd" stroke="#0369a1" class="card" />
  <text x="570" y="942" text-anchor="middle" class="boxTitle">movimiento_inventario_detalle</text>
  <text x="570" y="972" text-anchor="middle" class="boxText">Detalle por producto y cantidad</text>

  <rect x="420" y="1110" width="300" height="110" fill="#ccfbf1" stroke="#0f766e" class="card" />
  <text x="570" y="1152" text-anchor="middle" class="boxTitle">notificaciones</text>
  <text x="570" y="1182" text-anchor="middle" class="boxText">Alertas automáticas del sistema</text>

  <line x1="310" y1="220" x2="420" y2="340" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="350" y="285" class="label">1:N</text>

  <line x1="310" y1="360" x2="420" y2="340" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="350" y="345" class="label">N:1</text>

  <line x1="310" y1="500" x2="420" y2="340" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="350" y="425" class="label">1:N</text>

  <line x1="310" y1="645" x2="420" y2="340" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="350" y="495" class="label">Aprobación</text>

  <line x1="310" y1="800" x2="420" y2="355" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="350" y="610" class="label">Genera stock</text>

  <line x1="310" y1="955" x2="420" y2="355" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="350" y="740" class="label">1:N</text>

  <line x1="720" y1="340" x2="920" y2="230" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="795" y="285" class="label">solicita</text>

  <line x1="720" y1="340" x2="920" y2="440" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="790" y="405" class="label">1:N</text>

  <line x1="720" y1="360" x2="920" y2="760" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="790" y="575" class="label">notifica</text>

  <line x1="570" y1="415" x2="570" y2="505" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="590" y="470" class="label">1:N</text>

  <line x1="570" y1="625" x2="570" y2="700" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="590" y="665" class="label">1:N</text>

  <line x1="570" y1="820" x2="570" y2="900" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="590" y="865" class="label">1:N</text>

  <rect x="820" y="160" width="520" height="1080" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="24" ry="24" />
  <text x="1080" y="210" text-anchor="middle" class="boxTitle">Relaciones clave para multi-bodega</text>
  <text x="850" y="260" class="boxText">1. usuarios 1:N donaciones</text>
  <text x="850" y="295" class="boxText">2. usuarios 1:N solicitudes</text>
  <text x="850" y="330" class="boxText">3. usuarios 1:N productos_donados</text>
  <text x="850" y="365" class="boxText">4. usuarios 1:N notificaciones</text>
  <text x="850" y="400" class="boxText">5. usuarios 1:N bajas_productos</text>
  <text x="850" y="435" class="boxText">6. usuarios 1:N donante_depositos</text>
  <text x="850" y="470" class="boxText">7. depositos 1:N donante_depositos</text>
  <text x="850" y="505" class="boxText">8. depositos 1:N inventario</text>
  <text x="850" y="540" class="boxText">9. productos_donados 1:N inventario</text>
  <text x="850" y="575" class="boxText">10. inventario 1:N bajas_productos</text>
  <text x="850" y="610" class="boxText">11. solicitudes 1:N movimiento_inventario_cabecera</text>
  <text x="850" y="645" class="boxText">12. movimiento_inventario_cabecera 1:N detalle</text>
  <text x="850" y="680" class="boxText">13. productos_donados 1:N movimiento_inventario_detalle</text>
  <text x="850" y="715" class="boxText">14. donante_depositos define bodega principal por donante</text>
  <text x="850" y="750" class="boxText">15. donaciones aprobadas alimentan el inventario del depósito asignado</text>
  <text x="850" y="785" class="boxText">16. la clave única inventario(id_deposito,id_producto) evita duplicidad por bodega</text>
  <text x="850" y="820" class="boxText">17. el trigger de donaciones consolida producto y stock</text>
  <text x="850" y="855" class="boxText">18. el mapeo donante-bodega permite bodegas externas dispersas</text>
  <text x="850" y="890" class="boxText">19. las bajas registran retiro físico desde una bodega específica</text>
  <text x="850" y="925" class="boxText">20. las notificaciones informan cambios de estado y trazabilidad</text>
</svg>`;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpenCode';
  wb.created = new Date();
  wb.modified = new Date();

  const erd = wb.addWorksheet('ERD');
  erd.columns = [
    { header: 'Entidad', key: 'entidad', width: 28 },
    { header: 'Descripcion', key: 'descripcion', width: 52 },
    { header: 'Campos clave', key: 'campos', width: 66 },
  ];
  erd.addRows(entidades.map(([entidad, descripcion, campos]) => ({ entidad, descripcion, campos })));
  setTableStyle(erd, 'C');

  const rel = wb.addWorksheet('Relaciones');
  rel.columns = [
    { header: 'Origen', key: 'origen', width: 28 },
    { header: 'Destino', key: 'destino', width: 28 },
    { header: 'Cardinalidad', key: 'cardinalidad', width: 14 },
    { header: 'Descripcion', key: 'descripcion', width: 58 },
  ];
  rel.addRows(relaciones.map(([origen, destino, cardinalidad, descripcion]) => ({ origen, destino, cardinalidad, descripcion })));
  setTableStyle(rel, 'D');

  const multi = wb.addWorksheet('Multi-Bodega');
  multi.columns = [
    { header: 'Elemento', key: 'elemento', width: 28 },
    { header: 'Rol en la logica multi-bodega', key: 'rol', width: 88 },
  ];
  multi.addRows([
    { elemento: 'donante_depositos', rol: 'Asigna una o varias bodegas a cada donante y define la bodega principal activa.' },
    { elemento: 'depositos', rol: 'Representa bodegas externas dispersas donde se almacena inventario.' },
    { elemento: 'inventario', rol: 'Guarda stock por depósito y producto con unicidad por combinación.' },
    { elemento: 'crear_producto_desde_donacion', rol: 'Trigger que consolida producto e incrementa inventario en la bodega asignada.' },
    { elemento: 'dar_baja_producto', rol: 'Función que descuenta stock en una bodega específica y registra la baja.' },
    { elemento: 'auditoria', rol: 'Consultas de verificación para detectar mezcla de donantes o bodega incorrecta.' },
  ]);
  setTableStyle(multi, 'B');

  await wb.xlsx.writeFile(outputXlsx);
  fs.writeFileSync(outputSvg, buildSvg(), 'utf8');

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
  if (fs.existsSync(outputPng)) console.log(`Imagen generada: ${outputPng}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
