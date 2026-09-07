import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const manifestPath = join(projectRoot, 'tests', 'business-rules.json');
const validPriorities = new Set(['P0', 'P1', 'P2']);
const layerDefinitions = {
  database: {
    roots: ['supabase/tests/database'],
    extensions: new Set(['.sql']),
  },
  integration: {
    roots: ['tests/integration'],
    extensions: new Set(['.ts', '.tsx']),
  },
  unit: {
    roots: ['src', 'tests/unit'],
    extensions: new Set(['.ts', '.tsx']),
    testFilesOnly: true,
  },
  e2e: {
    roots: ['tests/e2e'],
    extensions: new Set(['.ts']),
  },
  ci: {
    roots: ['.github/workflows'],
    extensions: new Set(['.yml', '.yaml']),
  },
};

const collectFiles = async (relativePath, definition) => {
  const absolutePath = join(projectRoot, relativePath);
  let entries;

  try {
    entries = await readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const entryRelativePath = join(relativePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryRelativePath, definition));
      continue;
    }

    const isTestFile = /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name);
    if (
      definition.extensions.has(extname(entry.name))
      && (!definition.testFilesOnly || isTestFile)
    ) {
      files.push(entryRelativePath);
    }
  }

  return files;
};

const fail = (messages) => {
  for (const message of messages) {
    console.error(`- ${message}`);
  }
  process.exitCode = 1;
};

const rawManifest = await readFile(manifestPath, 'utf8');
const manifest = JSON.parse(rawManifest);
const errors = [];

if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.rules)) {
  fail(['tests/business-rules.json no tiene el formato de manifiesto versión 1.']);
} else {
  const seenIds = new Set();
  const sourcesByLayer = new Map();

  for (const [layer, definition] of Object.entries(layerDefinitions)) {
    const files = (
      await Promise.all(definition.roots.map((root) => collectFiles(root, definition)))
    ).flat();
    const sources = await Promise.all(files.map(async (file) => ({
      file,
      content: await readFile(join(projectRoot, file), 'utf8'),
    })));
    sourcesByLayer.set(layer, sources);
  }

  for (const [index, rule] of manifest.rules.entries()) {
    const location = `rules[${index}]`;
    if (!rule || typeof rule !== 'object') {
      errors.push(`${location} debe ser un objeto.`);
      continue;
    }

    if (typeof rule.id !== 'string' || !/^[A-Z][A-Z0-9]*(?:-P[0-2])?-\d{3}$/.test(rule.id)) {
      errors.push(`${location}.id no usa un identificador estable válido.`);
      continue;
    }
    if (seenIds.has(rule.id)) {
      errors.push(`El identificador ${rule.id} está duplicado.`);
    }
    seenIds.add(rule.id);

    if (typeof rule.domain !== 'string' || rule.domain.trim().length === 0) {
      errors.push(`${rule.id}: domain es obligatorio.`);
    }
    if (!validPriorities.has(rule.priority)) {
      errors.push(`${rule.id}: priority debe ser P0, P1 o P2.`);
    }
    if (typeof rule.description !== 'string' || rule.description.trim().length < 10) {
      errors.push(`${rule.id}: description debe explicar la regla.`);
    }
    if (!Array.isArray(rule.requiredLayers) || rule.requiredLayers.length === 0) {
      errors.push(`${rule.id}: requiredLayers no puede estar vacío.`);
      continue;
    }

    for (const layer of new Set(rule.requiredLayers)) {
      if (!(layer in layerDefinitions)) {
        errors.push(`${rule.id}: la capa ${layer} no está soportada.`);
        continue;
      }

      const sources = sourcesByLayer.get(layer) ?? [];
      const matches = sources.filter(({ content }) => content.includes(rule.id));
      if (matches.length === 0) {
        errors.push(`${rule.id}: falta referencia en la capa ${layer}.`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Trazabilidad inválida (${errors.length} problema(s)):`);
    fail(errors);
  } else {
    const totals = manifest.rules.reduce((counts, rule) => {
      counts[rule.priority] += 1;
      return counts;
    }, { P0: 0, P1: 0, P2: 0 });
    console.log(
      `Trazabilidad completa: ${manifest.rules.length} reglas `
      + `(P0=${totals.P0}, P1=${totals.P1}, P2=${totals.P2}).`,
    );
  }
}
