import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const reportPath = resolve(process.argv[2] ?? 'coverage-business/coverage-summary.json');
const baselinePath = resolve(process.argv[3] ?? 'tests/coverage-baseline.json');
const metrics = ['statements', 'branches', 'functions', 'lines'];

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

if (!report.total || baseline.schemaVersion !== 1 || !baseline.minimum || !baseline.target) {
  throw new Error('El reporte o el baseline de cobertura no tiene el formato esperado.');
}

const regressions = [];
for (const metric of metrics) {
  const current = report.total[metric];
  const minimum = baseline.minimum[metric];
  if (!current || !minimum) {
    regressions.push(`${metric}: falta en el reporte o baseline.`);
    continue;
  }

  if (current.total < minimum.total) {
    regressions.push(
      `${metric}: el alcance se redujo de ${minimum.total} a ${current.total} puntos medibles.`,
    );
  }
  if (current.pct < minimum.pct) {
    regressions.push(`${metric}: ${current.pct}% es menor que el baseline ${minimum.pct}%.`);
  }
}

if (regressions.length > 0) {
  console.error('El ratchet de cobertura detectó una regresión:');
  for (const regression of regressions) {
    console.error(`- ${regression}`);
  }
  process.exitCode = 1;
} else {
  console.log('Ratchet de cobertura completo sin regresiones:');
  for (const metric of metrics) {
    const current = report.total[metric];
    const target = baseline.target[metric];
    console.log(`- ${metric}: ${current.pct}% (objetivo ${target}%)`);
  }
}
