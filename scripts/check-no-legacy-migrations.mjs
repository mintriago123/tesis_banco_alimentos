import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const migrationsDirectory = path.join(projectRoot, 'supabase', 'migrations');
const contractMigration = '20260725051713_repair_donation_trigger_entries_source.sql';

const forbiddenObjectPattern = /\b(?:public\s*\.\s*)?inventario\b/iu;
const forbiddenQualifiedColumnPattern =
  /\bpublic\s*\.\s*productos_donados\s*\.\s*(?:cantidad|unidad_medida)\b/iu;
const productInsertPattern = /\binsert\s+into\s+public\.productos_donados\s*\(([^)]*)\)/giu;
const productUpdatePattern = /\bupdate\s+public\.productos_donados\s+set\s+([^;]+)/giu;

const migrationFiles = (await readdir(migrationsDirectory))
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort();

const firstContractIndex = migrationFiles.indexOf(contractMigration);

if (firstContractIndex === -1) {
  throw new Error(`No se encontró la migración que fija el contrato vigente: ${contractMigration}`);
}

const violations = [];

for (const fileName of migrationFiles.slice(firstContractIndex)) {
  const filePath = path.join(migrationsDirectory, fileName);
  const contents = await readFile(filePath, 'utf8');
  const sql = contents
    .replace(/\/\*[\s\S]*?\*\//gu, (comment) => comment.replace(/[^\n]/gu, ' '))
    .replace(/--[^\n]*/gu, (comment) => ' '.repeat(comment.length));

  const matches = [];
  const objectMatch = sql.match(forbiddenObjectPattern);
  const qualifiedColumnMatch = sql.match(forbiddenQualifiedColumnPattern);
  const productInsertMatch = [...sql.matchAll(productInsertPattern)].find(([, columns]) =>
    /\b(?:cantidad|unidad_medida)\b/iu.test(columns),
  );
  const productUpdateMatch = [...sql.matchAll(productUpdatePattern)].find(([, assignments]) =>
    /\b(?:cantidad|unidad_medida)\b/iu.test(assignments),
  );

  if (objectMatch) matches.push(objectMatch[0]);
  if (qualifiedColumnMatch) matches.push(qualifiedColumnMatch[0]);
  if (productInsertMatch) matches.push(productInsertMatch[0]);
  if (productUpdateMatch) matches.push(productUpdateMatch[0]);

  for (const match of matches) {
    const line = contents.slice(0, contents.indexOf(match)).split('\n').length;
    violations.push(`${fileName}:${line}: ${match.split('\n')[0].trim()}`);
  }
}

if (violations.length > 0) {
  console.error('Se encontraron referencias legacy en migraciones posteriores a la consolidación:');
  console.error(violations.map((violation) => `- ${violation}`).join('\n'));
  process.exit(1);
}

console.log(
  `OK: ${migrationFiles.length - firstContractIndex} migraciones desde la reparación no reintroducen objetos legacy.`,
);
