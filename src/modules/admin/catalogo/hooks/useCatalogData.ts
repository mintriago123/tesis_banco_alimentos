import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkFoodUsageAction,
  createFoodAction,
  deleteCategoryAction,
  deleteFoodAction,
  fetchFoodsAction,
  fetchUnidadesAction,
  updateFoodAction,
} from '../actions';
import type { CatalogFilters, CatalogStats, FoodFormValues, FoodRecord, Unidad } from '../types';

const DEFAULT_FILTERS: CatalogFilters = {
  search: '',
  category: 'todos',
};

const computeStats = (foods: FoodRecord[]): CatalogStats => {
  const uniqueCategories = new Set(foods.filter((food) => food.categoria).map((food) => food.categoria.trim().toLowerCase()));
  return { totalAlimentos: foods.length, totalCategorias: uniqueCategories.size };
};

const applyFilters = (foods: FoodRecord[], filters: CatalogFilters): FoodRecord[] => {
  const term = filters.search.trim().toLowerCase();

  return foods.filter((food) => {
    const matchesSearch = term ? food.nombre.toLowerCase().includes(term) : true;
    const matchesCategory =
      filters.category === 'todos' ? true : food.categoria ? food.categoria.toLowerCase() === filters.category.toLowerCase() : filters.category === 'Sin categoría';

    return matchesSearch && matchesCategory;
  });
};

export const useCatalogData = () => {
  const [foods, setFoods] = useState<FoodRecord[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [loadingUnidades, setLoadingUnidades] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const loadFoods = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    const result = await fetchFoodsAction();

    if (result.success && result.data) {
      setFoods(result.data);
    } else {
      setError(result.error ?? 'No fue posible cargar el catálogo');
    }

    setLoading(false);
  }, []);

  const loadUnidades = useCallback(async () => {
    setLoadingUnidades(true);
    const result = await fetchUnidadesAction();
    if (result.success && result.data) {
      setUnidades(result.data);
    } else {
      console.error('Error al cargar unidades:', result.error);
    }
    setLoadingUnidades(false);
  }, []);

  useEffect(() => {
    void loadFoods();
    void loadUnidades();
  }, [loadFoods, loadUnidades]);

  const stats = useMemo(() => computeStats(foods), [foods]);
  const filteredFoods = useMemo(() => applyFilters(foods, filters), [foods, filters]);

  const setSearch = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, search: value }));
  }, []);

  const setCategory = useCallback((category: string) => {
    setFilters((prev) => ({ ...prev, category }));
  }, []);

  const createFood = useCallback(
    async (values: FoodFormValues) => {
      const result = await createFoodAction(values);
      if (result.success) await loadFoods();
      return result;
    },
    [loadFoods],
  );

  const updateFood = useCallback(
    async (foodId: number, values: FoodFormValues) => {
      const result = await updateFoodAction(foodId, values);
      if (result.success) await loadFoods();
      return result;
    },
    [loadFoods],
  );

  const deleteFood = useCallback(
    async (foodId: number, cascade: boolean = false) => {
      const result = await deleteFoodAction(foodId, cascade);
      if (result.success) await loadFoods();
      return result;
    },
    [loadFoods],
  );

  const checkFoodUsage = useCallback(async (foodId: number) => checkFoodUsageAction(foodId), []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const categories = useMemo(() => {
    const dynamicCategories = Array.from(new Set(foods.filter((food) => food.categoria).map((food) => food.categoria.trim()))).sort();
    const hasFoodWithoutCategory = foods.some((food) => !food.categoria);
    const categoriesArray = ['todos', ...dynamicCategories];
    if (hasFoodWithoutCategory) categoriesArray.push('Sin categoría');
    return categoriesArray;
  }, [foods]);

  const categoriesWithCount = useMemo(() => {
    const categoryCounts = new Map<string, number>();
    foods.forEach((food) => {
      if (food.categoria) {
        const cat = food.categoria.trim();
        categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
      }
    });
    return Array.from(categoryCounts.entries())
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .filter((cat) => cat.cantidad > 0);
  }, [foods]);

  const deleteCategory = useCallback(
    async (categoryName: string) => {
      const result = await deleteCategoryAction(categoryName);
      if (result.success) await loadFoods();
      return result;
    },
    [loadFoods],
  );

  return {
    foods,
    filteredFoods,
    stats,
    filters,
    categories,
    categoriesWithCount,
    unidades,
    loading,
    loadingUnidades,
    error,
    setSearch,
    setCategory,
    resetFilters,
    createFood,
    updateFood,
    deleteFood,
    checkFoodUsage,
    deleteCategory,
    refreshCatalog: loadFoods,
  };
};
