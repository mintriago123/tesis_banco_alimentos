const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const docsDir = path.join(__dirname, '..', 'docs');
const outputXlsx = path.join(docsDir, 'Modulo_Trazabilidad_Actualizado.xlsx');
const outputSvg = path.join(docsDir, 'Modulo_Trazabilidad.svg');
const outputPng = path.join(docsDir, 'Modulo_Trazabilidad.png');

const secuencia = [
  ['1', 'Donante', 'Notificación de donación', 'Se notifica al donante que su alimento fue registrado/aprobado.'],
  ['2', 'Sistema', 'Registro virtual', 'Crea la donación, consolida producto y actualiza inventario por depósito.'],
  ['3', 'Operador', 'Asignación logística', 'Revisa inventario, aprueba solicitud y asigna bodega/cantidad.'],
  ['4', 'Sistema', 'Generación de comprobante', 'Emite código de comprobante y notificación al solicitante.'],
  ['5', 'Beneficiario', 'Entrega y retiro', 'Recibe la entrega presentando el comprobante o código.'],
];

const actividades = [
  ['Inicio', 'Evento de donación o solicitud pendiente'],
  ['Notificación', 'El sistema notifica al donante u operador'],
  ['Registro virtual', 'Se almacena la donación y se actualiza inventario'],
  ['Validación logística', 'Operador verifica stock y disponibilidad'],
  ['Asignación de bodega', 'Se define depósito y cantidad a procesar'],
  ['Generación de comprobante', 'Se crea el código único de trazabilidad'],
  ['Notificación al beneficiario', 'Se informa disponibilidad para retiro'],
  ['Entrega', 'Beneficiario presenta comprobante y recibe alimentos'],
  ['Cierre', 'Se actualiza el estado final y la auditoría'],
];

function styleTable(sheet, endColumn) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${endColumn}1` };
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = rowNumber === 1 ? 22 : 32;
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
<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="1600" viewBox="0 0 2200 1600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#eff6ff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
    <linearGradient id="header" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L12,6 L0,12 z" fill="#334155" />
    </marker>
    <style>
      .title { font: 700 36px Arial, sans-serif; fill: #ffffff; }
      .subtitle { font: 400 18px Arial, sans-serif; fill: #dbeafe; }
      .section { font: 700 22px Arial, sans-serif; fill: #0f172a; }
      .boxTitle { font: 700 18px Arial, sans-serif; fill: #0f172a; }
      .boxText { font: 400 14px Arial, sans-serif; fill: #1e293b; }
      .label { font: 700 14px Arial, sans-serif; fill: #334155; }
      .card { rx: 16; ry: 16; stroke-width: 2.2; }
      .small { font: 400 13px Arial, sans-serif; fill: #475569; }
    </style>
  </defs>

  <rect width="2200" height="1600" fill="url(#bg)" />
  <rect x="40" y="30" width="2120" height="110" rx="28" ry="28" fill="url(#header)" />
  <text x="80" y="78" class="title">Diseño del Módulo de Trazabilidad</text>
  <text x="80" y="112" class="subtitle">Ruta del alimento: Notificación del donante → Registro virtual → Asignación logística → Entrega al beneficiario</text>

  <text x="70" y="190" class="section">Diagrama de secuencia</text>
  <rect x="60" y="220" width="2080" height="470" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="22" ry="22" />

  <rect x="140" y="270" width="240" height="80" fill="#dbeafe" stroke="#2563eb" class="card" />
  <text x="260" y="302" text-anchor="middle" class="boxTitle">Donante</text>
  <text x="260" y="328" text-anchor="middle" class="boxText">Emite la donación</text>
  <line x1="260" y1="350" x2="260" y2="650" stroke="#94a3b8" stroke-dasharray="6 8" />

  <rect x="520" y="270" width="240" height="80" fill="#dcfce7" stroke="#16a34a" class="card" />
  <text x="640" y="302" text-anchor="middle" class="boxTitle">Sistema</text>
  <text x="640" y="328" text-anchor="middle" class="boxText">Registra y notifica</text>
  <line x1="640" y1="350" x2="640" y2="650" stroke="#94a3b8" stroke-dasharray="6 8" />

  <rect x="900" y="270" width="240" height="80" fill="#fef3c7" stroke="#d97706" class="card" />
  <text x="1020" y="302" text-anchor="middle" class="boxTitle">Operador</text>
  <text x="1020" y="328" text-anchor="middle" class="boxText">Valida logística</text>
  <line x1="1020" y1="350" x2="1020" y2="650" stroke="#94a3b8" stroke-dasharray="6 8" />

  <rect x="1280" y="270" width="240" height="80" fill="#ede9fe" stroke="#7c3aed" class="card" />
  <text x="1400" y="302" text-anchor="middle" class="boxTitle">Beneficiario</text>
  <text x="1400" y="328" text-anchor="middle" class="boxText">Recibe el alimento</text>
  <line x1="1400" y1="350" x2="1400" y2="650" stroke="#94a3b8" stroke-dasharray="6 8" />

  <line x1="260" y1="395" x2="640" y2="395" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="450" y="382" text-anchor="middle" class="label">1. Notificación de donación</text>

  <line x1="640" y1="440" x2="1020" y2="440" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="830" y="427" text-anchor="middle" class="label">2. Registro virtual</text>

  <line x1="1020" y1="485" x2="640" y2="485" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="830" y="472" text-anchor="middle" class="label">3. Asignación logística</text>

  <line x1="640" y1="530" x2="1400" y2="530" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="1020" y="517" text-anchor="middle" class="label">4. Generación de comprobante</text>

  <line x1="1400" y1="575" x2="1020" y2="575" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="1210" y="562" text-anchor="middle" class="label">5. Entrega al beneficiario</text>

  <text x="70" y="770" class="section">Diagrama de actividades</text>
  <rect x="60" y="800" width="2080" height="740" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="22" ry="22" />

  <rect x="120" y="865" width="250" height="66" fill="#0f172a" stroke="#0f172a" class="card" />
  <text x="245" y="905" text-anchor="middle" style="font:700 18px Arial; fill:#ffffff;">Inicio</text>

  <rect x="120" y="975" width="250" height="70" fill="#dbeafe" stroke="#2563eb" class="card" />
  <text x="245" y="1004" text-anchor="middle" class="boxTitle">Notificación</text>
  <text x="245" y="1029" text-anchor="middle" class="small">El donante recibe aviso</text>

  <rect x="120" y="1085" width="250" height="70" fill="#dcfce7" stroke="#16a34a" class="card" />
  <text x="245" y="1114" text-anchor="middle" class="boxTitle">Registro virtual</text>
  <text x="245" y="1139" text-anchor="middle" class="small">Donación e inventario</text>

  <rect x="120" y="1195" width="250" height="70" fill="#fef3c7" stroke="#d97706" class="card" />
  <text x="245" y="1224" text-anchor="middle" class="boxTitle">Validación logística</text>
  <text x="245" y="1249" text-anchor="middle" class="small">Stock y depósito</text>

  <rect x="120" y="1305" width="250" height="70" fill="#ede9fe" stroke="#7c3aed" class="card" />
  <text x="245" y="1334" text-anchor="middle" class="boxTitle">Entrega</text>
  <text x="245" y="1359" text-anchor="middle" class="small">Beneficiario recibe alimentos</text>

  <rect x="540" y="975" width="250" height="70" fill="#fee2e2" stroke="#dc2626" class="card" />
  <text x="665" y="1004" text-anchor="middle" class="boxTitle">Asignación de bodega</text>
  <text x="665" y="1029" text-anchor="middle" class="small">Depósito y cantidad</text>

  <rect x="540" y="1085" width="250" height="70" fill="#bae6fd" stroke="#0369a1" class="card" />
  <text x="665" y="1114" text-anchor="middle" class="boxTitle">Comprobante</text>
  <text x="665" y="1139" text-anchor="middle" class="small">Código único de trazabilidad</text>

  <rect x="540" y="1195" width="250" height="70" fill="#ccfbf1" stroke="#0f766e" class="card" />
  <text x="665" y="1224" text-anchor="middle" class="boxTitle">Notificación final</text>
  <text x="665" y="1249" text-anchor="middle" class="small">Se informa retiro/disponibilidad</text>

  <rect x="960" y="1085" width="250" height="70" fill="#f8fafc" stroke="#64748b" class="card" />
  <text x="1085" y="1114" text-anchor="middle" class="boxTitle">Cierre</text>
  <text x="1085" y="1139" text-anchor="middle" class="small">Estado final y auditoría</text>

  <line x1="245" y1="931" x2="245" y2="975" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="245" y1="1045" x2="245" y2="1085" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="245" y1="1155" x2="245" y2="1195" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="245" y1="1265" x2="245" y2="1305" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />

  <line x1="370" y1="1010" x2="540" y2="1010" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <text x="455" y="996" text-anchor="middle" class="label">validar</text>

  <line x1="665" y1="1045" x2="665" y2="1085" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="790" y1="1120" x2="960" y2="1120" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />

  <line x1="790" y1="1228" x2="960" y2="1120" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="1210" y1="1120" x2="1210" y2="1220" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />
  <line x1="1210" y1="1220" x2="960" y2="1220" stroke="#334155" stroke-width="3" marker-end="url(#arrow)" />

  <text x="1400" y="1470" class="small">Diseño orientado a notificación, virtualización del registro, asignación logística y entrega con comprobante.</text>
</svg>`;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpenCode';
  wb.created = new Date();
  wb.modified = new Date();

  const sec = wb.addWorksheet('Secuencia');
  sec.columns = [
    { header: 'Paso', key: 'paso', width: 10 },
    { header: 'Participante', key: 'participante', width: 20 },
    { header: 'Accion', key: 'accion', width: 28 },
    { header: 'Descripcion', key: 'descripcion', width: 72 },
  ];
  sec.addRows(secuencia.map(([paso, participante, accion, descripcion]) => ({ paso, participante, accion, descripcion })));
  styleTable(sec, 'D');

  const act = wb.addWorksheet('Actividades');
  act.columns = [
    { header: 'Orden', key: 'orden', width: 10 },
    { header: 'Actividad', key: 'actividad', width: 30 },
    { header: 'Descripcion', key: 'descripcion', width: 80 },
  ];
  act.addRows(actividades.map(([actividad, descripcion], index) => ({ orden: index === 0 ? 'Inicio' : String(index), actividad, descripcion })));
  styleTable(act, 'C');

  const notas = wb.addWorksheet('Notas');
  notas.columns = [
    { header: 'Elemento', key: 'elemento', width: 28 },
    { header: 'Detalle', key: 'detalle', width: 88 },
  ];
  notas.addRows([
    { elemento: 'Notificación del donante', detalle: 'Se dispara cuando la donación cambia de estado o se registra un evento relevante.' },
    { elemento: 'Registro virtual', detalle: 'La donación se consolida y actualiza el inventario del depósito correspondiente.' },
    { elemento: 'Asignación logística', detalle: 'El operador valida inventario, elige bodega y define la cantidad a entregar.' },
    { elemento: 'Entrega al beneficiario', detalle: 'La entrega final queda respaldada por comprobante y trazabilidad.' },
  ]);
  styleTable(notas, 'B');

  await wb.xlsx.writeFile(outputXlsx);
  fs.writeFileSync(outputSvg, buildSvg(), 'utf8');

  try {
    execFileSync('magick', [outputSvg, outputPng]);
  } catch {
    try {
      execFileSync('convert', [outputSvg, outputPng]);
    } catch {
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
