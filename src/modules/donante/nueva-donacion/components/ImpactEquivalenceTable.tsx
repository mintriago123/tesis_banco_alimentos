import { Info } from 'lucide-react';

export default function ImpactEquivalenceTable() {
  return (
    <details className="rounded-lg border border-blue-200 bg-blue-50">
      <summary className="flex cursor-pointer items-center gap-2 p-4 font-medium text-blue-800">
        <Info className="h-4 w-4" aria-hidden="true" />
        ¿Cómo estimamos el impacto?
      </summary>
      <div className="grid grid-cols-1 gap-4 border-t border-blue-200 px-4 pb-4 pt-4 text-sm sm:grid-cols-2">
        <div>
          <h3 className="mb-1 font-semibold text-blue-700">Kilogramo (kg)</h3>
          <ul className="space-y-1 text-blue-600">
            <li>1 kg = ~2 personas</li>
            <li>1 kg = ~3 porciones</li>
          </ul>
        </div>
        <div>
          <h3 className="mb-1 font-semibold text-blue-700">Gramo (g)</h3>
          <ul className="space-y-1 text-blue-600">
            <li>1000 g = ~2 personas</li>
            <li>1000 g = ~3 porciones</li>
          </ul>
        </div>
        <div>
          <h3 className="mb-1 font-semibold text-blue-700">Litro (L)</h3>
          <ul className="space-y-1 text-blue-600">
            <li>1 L = ~1.5 personas</li>
            <li>Líquidos como aceites y bebidas</li>
          </ul>
        </div>
        <div>
          <h3 className="mb-1 font-semibold text-blue-700">Mililitro (ml)</h3>
          <ul className="space-y-1 text-blue-600">
            <li>1000 ml = ~1.5 personas</li>
            <li>Líquidos como aceites y bebidas</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
