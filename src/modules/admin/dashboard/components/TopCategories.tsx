import type { TopCategoryItem, TopCategories as TopCategoriesData } from '../types';

interface TopCategoriesProps {
  categories: TopCategoriesData;
}

const CategoryList = ({
  title,
  items,
  accentClass,
  emptyLabel
}: {
  title: string;
  items: TopCategoryItem[];
  accentClass: string;
  emptyLabel: string;
}) => {
  const maxValue = Math.max(...items.map(item => item.total), 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-inner">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map(item => {
            const width = maxValue > 0 ? Math.round((item.total / maxValue) * 100) : 0;

            return (
              <div key={`${title}-${item.label}`}>
                <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span className="truncate">{item.label}</span>
                  <span className="shrink-0 text-slate-500">{item.total}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${accentClass}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const TopCategories = ({ categories }: TopCategoriesProps) => (
  <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
    <h2 className="text-lg font-semibold text-slate-800">Categorías con más movimiento</h2>
    <p className="text-sm text-slate-500">Máximo 5 categorías para priorizar compras, donaciones y abastecimiento.</p>

    <div className="mt-5 grid gap-4 xl:grid-cols-2">
      <CategoryList
        title="Más solicitadas"
        items={categories.solicitadas}
        accentClass="bg-gradient-to-r from-sky-500 to-sky-300"
        emptyLabel="Sin solicitudes registradas."
      />
      <CategoryList
        title="Más donadas"
        items={categories.donadas}
        accentClass="bg-gradient-to-r from-emerald-500 to-emerald-300"
        emptyLabel="Sin donaciones registradas."
      />
    </div>
  </div>
);

export default TopCategories;
