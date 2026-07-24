BEGIN;

-- Cubrir las FK que quedaron como relaciones activas después de retirar la
-- tabla agregada legacy. Estas rutas se usan en reportes, bajas y reversiones.
CREATE INDEX IF NOT EXISTS idx_entradas_inventario_donante_id
  ON public.entradas_inventario (donante_id);
CREATE INDEX IF NOT EXISTS idx_entradas_inventario_id_producto
  ON public.entradas_inventario (id_producto);
CREATE INDEX IF NOT EXISTS idx_entradas_inventario_unidad_id
  ON public.entradas_inventario (unidad_id);
CREATE INDEX IF NOT EXISTS idx_bajas_productos_id_entrada
  ON public.bajas_productos (id_entrada);
CREATE INDEX IF NOT EXISTS idx_movimiento_detalle_id_entrada
  ON public.movimiento_inventario_detalle (id_entrada);
CREATE INDEX IF NOT EXISTS idx_movimiento_detalle_id_deposito
  ON public.movimiento_inventario_detalle (id_deposito);
CREATE INDEX IF NOT EXISTS idx_movimiento_detalle_unidad_convertida
  ON public.movimiento_inventario_detalle (unidad_convertida_id);

COMMIT;
