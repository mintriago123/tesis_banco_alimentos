const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const docsDir = path.join(__dirname, '..', 'docs');
const outputXlsx = path.join(docsDir, 'Modulo_Trazabilidad_Formal.xlsx');
const outputSvg = path.join(docsDir, 'Modulo_Trazabilidad_Formal.svg');
const outputPng = path.join(docsDir, 'Modulo_Trazabilidad_Formal.png');

const resumen = [
  ['Objetivo', 'Describir la ruta trazable del alimento desde la notificación inicial hasta la entrega final al beneficiario.'],
  ['Alcance', 'Incluye donación, registro virtual, validación logística, generación de comprobante y entrega.'],
  ['Actores', 'Donante, Sistema, Operador, Beneficiario.'],
  ['Resultado esperado', 'Garantizar control, trazabilidad y evidencia documental del flujo de alimento.'],
];

const secuencia = [
  ['1', 'Donante', 'Notificación del evento', 'El sistema informa al donante que la donación fue registrada o aprobada.'],
  ['2', 'Sistema', 'Registro virtual', 'Se consolida la donación y se actualiza el inventario asociado al depósito.'],
  ['3', 'Operador', 'Asignación logística', 'Se verifica disponibilidad, depósito y cantidad a procesar.'],
  ['4', 'Sistema', 'Generación de comprobante', 'Se emite un código único de trazabilidad para la entrega.'],
  ['5', 'Beneficiario', 'Recepción del alimento', 'El beneficiario retira el alimento mediante el comprobante generado.'],
];

const actividades = [
  ['Inicio', 'Se origina un evento de donación o una solicitud pendiente.'],
  ['Notificación', 'El donante recibe confirmación y el operador es advertido del registro.'],
  ['Registro virtual', 'La donación se almacena y se asocia al inventario correspondiente.'],
  ['Validación logística', 'El operador valida stock, depósito y cantidad disponible.'],
  ['Asignación de bodega', 'Se determina la bodega y se reserva la cantidad a entregar.'],
  ['Emisión de comprobante', 'Se genera el comprobante de trazabilidad con código único.'],
  ['Aviso al beneficiario', 'Se comunica la disponibilidad para retiro o entrega.'],
  ['Entrega', 'El beneficiario presenta el comprobante y recibe los alimentos.'],
  ['Cierre', 'Se actualiza el estado final y se conserva la evidencia de auditoría.'],
];

function setStyle(sheet, endColumn) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${endColumn}1` };
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = rowNumber === 1 ? 22 : 32;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      if (rowNumber > 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
      }
    });
  });
}

function buildSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="1400" viewBox="0 0 2200 1400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#eef2ff"/>
    </linearGradient>
    <linearGradient id="header" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L12,6 L0,12 z" fill="#334155" />
    </marker>
    <style>
      .title { font: 700 34px Arial, sans-serif; fill: #ffffff; }
      .subtitle { font: 400 18px Arial, sans-serif; fill: #cbd5e1; }
      .section { font: 700 22px Arial, sans-serif; fill: #0f172a; }
      .boxTitle { font: 700 18px Arial, sans-serif; fill: #0f172a; }
      .boxText { font: 400 14px Arial, sans-serif; fill: #1e293b; }
      .label { font: 700 13px Arial, sans-serif; fill: #475569; }
      .small { font: 400 13px Arial, sans-serif; fill: #475569; }
      .card { rx: 16; ry: 16; stroke-width: 2; }
    </style>
  </defs>

  <rect width="2200" height="1400" fill="url(#bg)" />
  <rect x="40" y="30" width="2120" height="100" rx="24" ry="24" fill="url(#header)" />
  <text x="80" y="72" class="title">Diseño Formal del Módulo de Trazabilidad</text>
  <text x="80" y="100" class="subtitle">Ruta del alimento desde la notificación del donante hasta la entrega al beneficiario</text>

  <text x="70" y="170" class="section">Descripción general</text>
  <rect x="60" y="190" width="2080" height="150" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="18" ry="18" />
  <text x="90" y="235" class="boxText">El módulo de trazabilidad asegura el seguimiento de cada alimento a lo largo del proceso operativo, desde su registro inicial hasta la entrega final.</text>
  <text x="90" y="265" class="boxText">El flujo contempla notificación, registro virtual, validación logística, asignación de depósito, emisión de comprobante y cierre con auditoría.</text>
  <text x="90" y="295" class="boxText">La información registrada respalda el control interno, la trazabilidad documental y la atención al beneficiario.</text>

  <text x="70" y="390" class="section">Diagrama de secuencia</text>
  <rect x="60" y="420" width="2080" height="360" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="18" ry="18" />

  <rect x="130" y="465" width="220" height="72" fill="#dbeafe" stroke="#2563eb" class="card" />
  <text x="240" y="495" text-anchor="middle" class="boxTitle">Donante</text>
  <text x="240" y="520" text-anchor="middle" class="boxText">Origen de la donación</text>
  <line x1="240" y1="537" x2="240" y2="760" stroke="#94a3b8" stroke-dasharray="5 7" />

  <rect x="520" y="465" width="220" height="72" fill="#dcfce7" stroke="#16a34a" class="card" />
  <text x="630" y="495" text-anchor="middle" class="boxTitle">Sistema</text>
  <text x="630" y="520" text-anchor="middle" class="boxText">Registro y control</text>
  <line x1="630" y1="537" x2="630" y2="760" stroke="#94a3b8" stroke-dasharray="5 7" />

  <rect x="910" y="465" width="220" height="72" fill="#fef3c7" stroke="#d97706" class="card" />
  <text x="1020" y="495" text-anchor="middle" class="boxTitle">Operador</text>
  <text x="1020" y="520" text-anchor="middle" class="boxText">Validación logística</text>
  <line x1="1020" y1="537" x2="1020" y2="760" stroke="#94a3b8" stroke-dasharray="5 7" />

  <rect x="1300" y="465" width="220" height="72" fill="#ede9fe" stroke="#7c3aed" class="card" />
  <text x="1410" y="495" text-anchor="middle" class="boxTitle">Beneficiario</text>
  <text x="1410" y="520" text-anchor="middle" class="boxText">Recepción final</text>
  <line x1="1410" y1="537" x2="1410" y2="760" stroke="#94a3b8" stroke-dasharray="5 7" />

  <line x1="240" y1="590" x2="630" y2="590" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="435" y="577" text-anchor="middle" class="label">Notificación del donante</text>

  <line x1="630" y1="635" x2="1020" y2="635" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="825" y="622" text-anchor="middle" class="label">Registro virtual</text>

  <line x1="1020" y1="680" x2="630" y2="680" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="825" y="667" text-anchor="middle" class="label">Asignación logística</text>

  <line x1="630" y1="725" x2="1410" y2="725" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="1020" y="712" text-anchor="middle" class="label">Entrega al beneficiario</text>

  <text x="70" y="850" class="section">Diagrama de actividades</text>
  <rect x="60" y="880" width="2080" height="440" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="18" ry="18" />

  <rect x="160" y="940" width="220" height="58" fill="#0f172a" stroke="#0f172a" class="card" />
  <text x="270" y="977" text-anchor="middle" style="font:700 17px Arial; fill:#ffffff;">Inicio</text>

  <rect x="420" y="940" width="220" height="58" fill="#dbeafe" stroke="#2563eb" class="card" />
  <text x="530" y="970" text-anchor="middle" class="boxTitle">Notificación</text>

  <rect x="680" y="940" width="220" height="58" fill="#dcfce7" stroke="#16a34a" class="card" />
  <text x="790" y="970" text-anchor="middle" class="boxTitle">Registro virtual</text>

  <rect x="940" y="940" width="220" height="58" fill="#fef3c7" stroke="#d97706" class="card" />
  <text x="1050" y="970" text-anchor="middle" class="boxTitle">Validación logística</text>

  <rect x="1200" y="940" width="220" height="58" fill="#fee2e2" stroke="#dc2626" class="card" />
  <text x="1310" y="970" text-anchor="middle" class="boxTitle">Asignación de bodega</text>

  <rect x="1460" y="940" width="220" height="58" fill="#bae6fd" stroke="#0369a1" class="card" />
  <text x="1570" y="970" text-anchor="middle" class="boxTitle">Comprobante</text>

  <rect x="1720" y="940" width="220" height="58" fill="#ede9fe" stroke="#7c3aed" class="card" />
  <text x="1830" y="970" text-anchor="middle" class="boxTitle">Entrega</text>

  <rect x="940" y="1060" width="220" height="58" fill="#f8fafc" stroke="#64748b" class="card" />
  <text x="1050" y="1090" text-anchor="middle" class="boxTitle">Cierre y auditoría</text>

  <line x1="380" y1="969" x2="420" y2="969" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="640" y1="969" x2="680" y2="969" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="900" y1="969" x2="940" y2="969" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="1160" y1="969" x2="1200" y2="969" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="1420" y1="969" x2="1460" y2="969" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="1830" y1="998" x2="1830" y2="1060" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="1720" y1="1089" x2="1160" y2="1089" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />

  <text x="70" y="1360" class="small">El diseño formal prioriza claridad conceptual, secuencia operacional y evidencia documental de la trazabilidad.</text>
</svg>`;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpenCode';
  wb.created = new Date();
  wb.modified = new Date();

  const info = wb.addWorksheet('Resumen');
  info.columns = [
    { header: 'Seccion', key: 'seccion', width: 24 },
    { header: 'Descripcion', key: 'descripcion', width: 96 },
  ];
  info.addRows(resumen.map(([seccion, descripcion]) => ({ seccion, descripcion })));
  setStyle(info, 'B');

  const sec = wb.addWorksheet('Secuencia');
  sec.columns = [
    { header: 'Paso', key: 'paso', width: 10 },
    { header: 'Actor', key: 'actor', width: 18 },
    { header: 'Accion', key: 'accion', width: 28 },
    { header: 'Descripcion', key: 'descripcion', width: 78 },
  ];
  sec.addRows(secuencia.map(([paso, actor, accion, descripcion]) => ({ paso, actor, accion, descripcion })));
  setStyle(sec, 'D');

  const act = wb.addWorksheet('Actividades');
  act.columns = [
    { header: 'Orden', key: 'orden', width: 12 },
    { header: 'Actividad', key: 'actividad', width: 32 },
    { header: 'Descripcion', key: 'descripcion', width: 90 },
  ];
  act.addRows(actividades.map(([actividad, descripcion], index) => ({ orden: String(index + 1), actividad, descripcion })));
  setStyle(act, 'C');

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
