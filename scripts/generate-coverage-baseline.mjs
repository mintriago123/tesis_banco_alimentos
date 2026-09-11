import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Regenerates tests/coverage-baseline.json's `minimum` from a fresh
// coverage-business/coverage-summary.json, preserving the existing `target`
// (and `schemaVersion`/`notes`) so raising the ratchet floor doesn't require
// hand-editing numbers. Run after `RUN_DB_INTEGRATION=true pnpm
// test:coverage:business` once new coverage is intentionally higher than
// the committed baseline — never run this to paper over a real regression.
const reportPath = resolve(process.argv[2] ?? 'coverage-business/coverage-summary.json');
const baselinePath = resolve(process.argv[3] ?? 'tests/coverage-baseline.json');
const metrics = ['statements', 'branches', 'functions', 'lines'];

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

if (!report.total) {
  throw new Error(`${reportPath} no tiene el formato esperado (falta "total").`);
}

const minimum = {};
for (const metric of metrics) {
  const current = report.total[metric];
  minimum[metric] = { total: current.total, covered: current.covered, pct: current.pct };
}

const updated = { ...baseline, minimum, generatedAt: new Date().toISOString().slice(0, 10) };
await writeFile(baselinePath, `${JSON.stringify(updated, null, 2)}\n`);

console.log(`Baseline actualizado en ${baselinePath}:`);
for (const metric of metrics) {
  console.log(`- ${metric}: ${minimum[metric].pct}% (objetivo ${baseline.target?.[metric] ?? 'sin definir'}%)`);
}
