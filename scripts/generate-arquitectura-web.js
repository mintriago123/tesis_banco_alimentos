const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const docsDir = path.join(__dirname, '..', 'docs');
const outputXlsx = path.join(docsDir, 'Arquitectura_Web_Actualizada.xlsx');
const outputSvg = path.join(docsDir, 'Diagrama_Arquitectura_Web.svg');
const outputPng = path.join(docsDir, 'Diagrama_Arquitectura_Web.png');

const rows = [
  ['Frontend', 'Next.js, React, componentes, layouts, hooks', 'Interfaz de usuario, navegación y formularios', 'src/app/*; src/app/components/*'],
  ['Backend', 'Supabase Auth, API Routes, servicios, middleware', 'Autenticación, autorización y lógica de negocio', 'src/proxy.ts; src/lib/*; src/modules/*/services/*'],
  ['Base de datos', 'PostgreSQL, RLS, triggers, funciones', 'Persistencia, seguridad y trazabilidad', 'database/*.sql; docs/DATABASE.md'],
  ['APIs externas', 'Mapbox, validación RUC/Cédula, correo', 'Geolocalización, validación de identidad y notificaciones', 'README.md; src/modules/shared/hooks/useIdentityValidation.ts'],
];

function addTableStyle(sheet, endColumn) {
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
    });
  });
}

function buildSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="860" viewBox="0 0 1600 860">
  <defs>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L12,6 L0,12 z" fill="#334155" />
    </marker>
    <style>
      .title { font: 700 34px Arial, sans-serif; fill: #0f172a; }
      .subtitle { font: 400 18px Arial, sans-serif; fill: #475569; }
      .boxTitle { font: 700 24px Arial, sans-serif; fill: #0f172a; }
      .boxText { font: 400 18px Arial, sans-serif; fill: #1e293b; }
      .label { font: 700 16px Arial, sans-serif; fill: #475569; }
      .card { rx: 24; ry: 24; stroke-width: 2.5; }
    </style>
  </defs>

  <rect width="1600" height="860" fill="#f8fafc" />
  <text x="80" y="78" class="title">Diagrama de bloques de la arquitectura web</text>
  <text x="80" y="112" class="subtitle">Frontend, Backend, Base de Datos y APIs externas</text>

  <rect x="70" y="210" width="230" height="120" fill="#dbeafe" stroke="#2563eb" class="card" />
  <text x="185" y="258" text-anchor="middle" class="boxTitle">Usuario</text>
  <text x="185" y="292" text-anchor="middle" class="boxText">Navegador web</text>

  <rect x="350" y="150" width="320" height="240" fill="#dcfce7" stroke="#16a34a" class="card" />
  <text x="510" y="198" text-anchor="middle" class="boxTitle">Frontend</text>
  <text x="510" y="236" text-anchor="middle" class="boxText">Next.js</text>
  <text x="510" y="266" text-anchor="middle" class="boxText">React</text>
  <text x="510" y="296" text-anchor="middle" class="boxText">Layouts y hooks</text>
  <text x="510" y="326" text-anchor="middle" class="boxText">Componentes UI</text>

  <rect x="730" y="130" width="360" height="280" fill="#fae8ff" stroke="#c026d3" class="card" />
  <text x="910" y="178" text-anchor="middle" class="boxTitle">Backend</text>
  <text x="910" y="216" text-anchor="middle" class="boxText">Supabase Auth</text>
  <text x="910" y="246" text-anchor="middle" class="boxText">API Routes / Server Actions</text>
  <text x="910" y="276" text-anchor="middle" class="boxText">Servicios de negocio</text>
  <text x="910" y="306" text-anchor="middle" class="boxText">Middleware / proxy.ts</text>
  <text x="910" y="336" text-anchor="middle" class="boxText">Validaciones y control de acceso</text>

  <rect x="1140" y="140" width="360" height="260" fill="#fee2e2" stroke="#dc2626" class="card" />
  <text x="1320" y="188" text-anchor="middle" class="boxTitle">Base de Datos</text>
  <text x="1320" y="226" text-anchor="middle" class="boxText">PostgreSQL / Supabase</text>
  <text x="1320" y="256" text-anchor="middle" class="boxText">RLS</text>
  <text x="1320" y="286" text-anchor="middle" class="boxText">Triggers</text>
  <text x="1320" y="316" text-anchor="middle" class="boxText">Funciones SQL</text>

  <rect x="1140" y="470" width="360" height="250" fill="#e0f2fe" stroke="#0284c7" class="card" />
  <text x="1320" y="518" text-anchor="middle" class="boxTitle">APIs externas</text>
  <text x="1320" y="556" text-anchor="middle" class="boxText">Mapbox / Geolocalización</text>
  <text x="1320" y="586" text-anchor="middle" class="boxText">Validación RUC / Cédula</text>
  <text x="1320" y="616" text-anchor="middle" class="boxText">Servicio de correo</text>

  <line x1="300" y1="270" x2="350" y2="270" stroke="#334155" stroke-width="4" marker-end="url(#arrow)" />
  <text x="324" y="250" text-anchor="middle" class="label">interacción</text>

  <line x1="670" y1="250" x2="730" y2="250" stroke="#334155" stroke-width="4" marker-end="url(#arrow)" />
  <text x="700" y="230" text-anchor="middle" class="label">requests</text>

  <line x1="1090" y1="210" x2="1140" y2="210" stroke="#334155" stroke-width="4" marker-end="url(#arrow)" />
  <text x="1115" y="190" text-anchor="middle" class="label">persistencia</text>

  <line x1="1090" y1="300" x2="1140" y2="300" stroke="#334155" stroke-width="4" marker-end="url(#arrow)" />
  <text x="1115" y="282" text-anchor="middle" class="label">integraciones</text>

  <line x1="910" y1="410" x2="1320" y2="410" stroke="#334155" stroke-width="3" stroke-dasharray="8 8" />
  <text x="1115" y="398" text-anchor="middle" class="label">lectura / escritura</text>

  <line x1="510" y1="390" x2="1320" y2="470" stroke="#334155" stroke-width="3" stroke-dasharray="8 8" marker-end="url(#arrow)" />
  <text x="900" y="455" text-anchor="middle" class="label">mapas, identidad y correo</text>

  <rect x="350" y="470" width="320" height="170" fill="#fef3c7" stroke="#d97706" class="card" />
  <text x="510" y="520" text-anchor="middle" class="boxTitle">Presentación</text>
  <text x="510" y="556" text-anchor="middle" class="boxText">Pantallas, formularios y tableros</text>
  <text x="510" y="586" text-anchor="middle" class="boxText">Control visual del flujo</text>

  <line x1="510" y1="390" x2="510" y2="470" stroke="#334155" stroke-width="4" marker-end="url(#arrow)" />
  <text x="540" y="435" class="label">UI</text>

  <line x1="670" y1="560" x2="730" y2="560" stroke="#334155" stroke-width="4" marker-end="url(#arrow)" />
  <text x="700" y="540" text-anchor="middle" class="label">procesamiento</text>
</svg>`;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OpenCode';
  workbook.created = new Date();
  workbook.modified = new Date();

  const resumen = workbook.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Capa', key: 'capa', width: 20 },
    { header: 'Componentes', key: 'componentes', width: 40 },
    { header: 'Funcion', key: 'funcion', width: 46 },
    { header: 'Evidencia', key: 'evidencia', width: 52 },
  ];
  resumen.addRows(rows.map(([capa, componentes, funcion, evidencia]) => ({ capa, componentes, funcion, evidencia })));
  addTableStyle(resumen, 'D');

  const bloques = workbook.addWorksheet('Bloques');
  bloques.columns = [
    { header: 'Bloque', key: 'bloque', width: 20 },
    { header: 'Descripcion', key: 'descripcion', width: 54 },
    { header: 'Responsabilidad', key: 'responsabilidad', width: 52 },
  ];
  bloques.addRows([
    { bloque: 'Frontend', descripcion: 'Capa de presentación construida con Next.js y React.', responsabilidad: 'Mostrar pantallas, formularios, dashboards y navegación.' },
    { bloque: 'Backend', descripcion: 'Lógica de negocio, autenticación y control de acceso.', responsabilidad: 'Procesar peticiones, validar usuarios y coordinar acciones.' },
    { bloque: 'Base de datos', descripcion: 'Persistencia central en PostgreSQL con Supabase.', responsabilidad: 'Guardar información, aplicar RLS y mantener trazabilidad.' },
    { bloque: 'APIs externas', descripcion: 'Servicios de apoyo para geolocalización e identidad.', responsabilidad: 'Proveer mapas, validación de documentos y correo.' },
  ]);
  addTableStyle(bloques, 'C');

  await workbook.xlsx.writeFile(outputXlsx);
  fs.writeFileSync(outputSvg, buildSvg(), 'utf8');

  try {
    execFileSync('convert', [outputSvg, outputPng]);
  } catch (error) {
    console.error('No se pudo convertir SVG a PNG. El SVG quedó generado.', error.message);
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
