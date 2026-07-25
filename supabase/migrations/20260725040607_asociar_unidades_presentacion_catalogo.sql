BEGIN;

-- Esta migración solo amplía el catálogo de unidades permitido por alimento.
-- No reclasifica productos, inventario, donaciones, solicitudes ni movimientos.
-- El bloqueo compartido evita que el catálogo cambie entre la validación y la
-- inserción de las asociaciones.
LOCK TABLE public.alimentos, public.unidades, public.alimentos_unidades
  IN SHARE MODE;

CREATE TEMP TABLE _auditoria_alimentos ON COMMIT DROP AS
SELECT * FROM public.alimentos;

CREATE TEMP TABLE _auditoria_alimentos_unidades ON COMMIT DROP AS
SELECT * FROM public.alimentos_unidades;

CREATE TEMP TABLE _auditoria_unidades ON COMMIT DROP AS
SELECT * FROM public.unidades;

CREATE TEMP TABLE _auditoria_productos_donados ON COMMIT DROP AS
SELECT * FROM public.productos_donados;

CREATE TEMP TABLE _auditoria_entradas_inventario ON COMMIT DROP AS
SELECT * FROM public.entradas_inventario;

CREATE TEMP TABLE _auditoria_donaciones ON COMMIT DROP AS
SELECT * FROM public.donaciones;

CREATE TEMP TABLE _auditoria_solicitudes ON COMMIT DROP AS
SELECT * FROM public.solicitudes;

CREATE TEMP TABLE _auditoria_movimientos_inventario ON COMMIT DROP AS
SELECT * FROM public.movimiento_inventario_detalle;

CREATE TEMP TABLE _auditoria_conversiones ON COMMIT DROP AS
SELECT * FROM public.conversiones;

CREATE TEMP TABLE _matriz_unidades_presentacion (
  alimento_nombre text NOT NULL,
  unidad_simbolo text NOT NULL,
  PRIMARY KEY (alimento_nombre, unidad_simbolo)
) ON COMMIT DROP;

INSERT INTO pg_temp._matriz_unidades_presentacion (alimento_nombre, unidad_simbolo)
VALUES
  ('Huevos', 'ud'),
  ('Huevos', 'doc'),
  ('Pan', 'ud'),
  ('Sardinas', 'lata'),
  ('Salsa de tomate', 'lata'),
  ('Vegetales enlatados', 'lata'),
  ('Frutas enlatadas', 'lata');

CREATE TEMP TABLE _alimentos_esperados ON COMMIT DROP AS
SELECT DISTINCT alimento_nombre
FROM pg_temp._matriz_unidades_presentacion;

CREATE TEMP TABLE _unidades_esperadas ON COMMIT DROP AS
SELECT DISTINCT unidad_simbolo
FROM pg_temp._matriz_unidades_presentacion;

DO $$
DECLARE
  v_ambiguos text;
  v_faltantes text;
  v_unidades_invalidas text;
BEGIN
  -- La normalización es deliberadamente conservadora: recorta, compacta
  -- espacios y compara sin distinguir mayúsculas/minúsculas.
  SELECT string_agg(problema, ', ' ORDER BY problema)
  INTO v_ambiguos
  FROM (
    SELECT e.alimento_nombre AS problema
    FROM pg_temp._alimentos_esperados e
    LEFT JOIN public.alimentos a
      ON lower(regexp_replace(btrim(a.nombre), '\s+', ' ', 'g')) =
         lower(regexp_replace(btrim(e.alimento_nombre), '\s+', ' ', 'g'))
    GROUP BY e.alimento_nombre
    HAVING count(a.id) > 1
  ) ambiguos;

  IF v_ambiguos IS NOT NULL THEN
    RAISE EXCEPTION
      'La migración se detuvo: nombres de alimentos ambiguos: %',
      v_ambiguos;
  END IF;

  SELECT string_agg(problema, ', ' ORDER BY problema)
  INTO v_faltantes
  FROM (
    SELECT e.alimento_nombre AS problema
    FROM pg_temp._alimentos_esperados e
    LEFT JOIN public.alimentos a
      ON lower(regexp_replace(btrim(a.nombre), '\s+', ' ', 'g')) =
         lower(regexp_replace(btrim(e.alimento_nombre), '\s+', ' ', 'g'))
    GROUP BY e.alimento_nombre
    HAVING count(a.id) = 0
  ) faltantes;

  IF v_faltantes IS NOT NULL THEN
    RAISE EXCEPTION
      'La migración se detuvo: alimentos faltantes: %',
      v_faltantes;
  END IF;

  SELECT string_agg(problema, ', ' ORDER BY problema)
  INTO v_ambiguos
  FROM (
    SELECT e.unidad_simbolo AS problema
    FROM pg_temp._unidades_esperadas e
    LEFT JOIN public.unidades u
      ON lower(btrim(u.simbolo)) = lower(btrim(e.unidad_simbolo))
    GROUP BY e.unidad_simbolo
    HAVING count(u.id) > 1
  ) ambiguos;

  IF v_ambiguos IS NOT NULL THEN
    RAISE EXCEPTION
      'La migración se detuvo: símbolos de unidades ambiguos: %',
      v_ambiguos;
  END IF;

  SELECT string_agg(problema, ', ' ORDER BY problema)
  INTO v_faltantes
  FROM (
    SELECT e.unidad_simbolo AS problema
    FROM pg_temp._unidades_esperadas e
    LEFT JOIN public.unidades u
      ON lower(btrim(u.simbolo)) = lower(btrim(e.unidad_simbolo))
    GROUP BY e.unidad_simbolo
    HAVING count(u.id) = 0
  ) faltantes;

  IF v_faltantes IS NOT NULL THEN
    RAISE EXCEPTION
      'La migración se detuvo: unidades faltantes: %',
      v_faltantes;
  END IF;

  -- Evita asociar por accidente una unidad de masa/volumen con símbolo
  -- reutilizado. Las unidades de esta matriz deben ser discretas y activas;
  -- es_presentacion no se usa como requisito porque el catálogo histórico
  -- puede conservar esa bandera en false para la unidad ud.
  SELECT string_agg(u.simbolo, ', ' ORDER BY u.simbolo)
  INTO v_unidades_invalidas
  FROM public.unidades u
  JOIN pg_temp._unidades_esperadas e
    ON lower(btrim(u.simbolo)) = lower(btrim(e.unidad_simbolo))
  WHERE u.tipo_magnitud_id <> 4
     OR u.activa IS NOT TRUE
     OR u.es_discreta IS NOT TRUE;

  IF v_unidades_invalidas IS NOT NULL THEN
    RAISE EXCEPTION
      'La migración se detuvo: unidades de presentación inválidas: %',
      v_unidades_invalidas;
  END IF;
END;
$$;

DO $$
DECLARE
  v_alimentos bigint;
  v_relaciones bigint;
  v_unidades bigint;
  v_productos bigint;
  v_entradas bigint;
BEGIN
  SELECT count(*) INTO v_alimentos FROM pg_temp._auditoria_alimentos;
  SELECT count(*) INTO v_relaciones FROM pg_temp._auditoria_alimentos_unidades;
  SELECT count(*) INTO v_unidades FROM pg_temp._auditoria_unidades;
  SELECT count(*) INTO v_productos FROM pg_temp._auditoria_productos_donados;
  SELECT count(*) INTO v_entradas FROM pg_temp._auditoria_entradas_inventario;

  RAISE NOTICE
    'Auditoría previa de unidades no convertibles: alimentos=%, relaciones=%, unidades=%, productos=%, entradas_inventario=%',
    v_alimentos, v_relaciones, v_unidades, v_productos, v_entradas;
END;
$$;

-- Insertar solo las asociaciones nuevas. La restricción existente protege la
-- operación frente a duplicados y conserva cualquier relación ya registrada,
-- incluyendo su valor actual de es_unidad_principal.
INSERT INTO public.alimentos_unidades (
  alimento_id,
  unidad_id,
  es_unidad_principal
)
SELECT a.id, u.id, false
FROM pg_temp._matriz_unidades_presentacion m
JOIN public.alimentos a
  ON lower(regexp_replace(btrim(a.nombre), '\s+', ' ', 'g')) =
     lower(regexp_replace(btrim(m.alimento_nombre), '\s+', ' ', 'g'))
JOIN public.unidades u
  ON lower(btrim(u.simbolo)) = lower(btrim(m.unidad_simbolo))
ON CONFLICT (alimento_id, unidad_id) DO NOTHING;

DO $$
DECLARE
  v_faltantes text;
  v_no_matriz text;
  v_principales_incorrectas text;
  v_diferencias bigint;
BEGIN
  -- Cada fila de la matriz debe existir después de la migración.
  SELECT string_agg(format('%s -> %s', m.alimento_nombre, m.unidad_simbolo), ', ' ORDER BY m.alimento_nombre, m.unidad_simbolo)
  INTO v_faltantes
  FROM pg_temp._matriz_unidades_presentacion m
  JOIN public.alimentos a
    ON lower(regexp_replace(btrim(a.nombre), '\s+', ' ', 'g')) =
       lower(regexp_replace(btrim(m.alimento_nombre), '\s+', ' ', 'g'))
  JOIN public.unidades u
    ON lower(btrim(u.simbolo)) = lower(btrim(m.unidad_simbolo))
  LEFT JOIN public.alimentos_unidades au
    ON au.alimento_id = a.id
   AND au.unidad_id = u.id
  WHERE au.id IS NULL;

  IF v_faltantes IS NOT NULL THEN
    RAISE EXCEPTION
      'La migración se detuvo: asociaciones no creadas: %',
      v_faltantes;
  END IF;

  -- Las únicas relaciones nuevas permitidas son las declaradas en la matriz.
  SELECT string_agg(format('%s -> %s', a.nombre, u.simbolo), ', ' ORDER BY a.nombre, u.simbolo)
  INTO v_no_matriz
  FROM public.alimentos_unidades au
  JOIN public.alimentos a ON a.id = au.alimento_id
  JOIN public.unidades u ON u.id = au.unidad_id
  WHERE NOT EXISTS (
          SELECT 1
          FROM pg_temp._auditoria_alimentos_unidades anterior
          WHERE anterior.alimento_id = au.alimento_id
            AND anterior.unidad_id = au.unidad_id
        )
    AND NOT EXISTS (
          SELECT 1
          FROM pg_temp._matriz_unidades_presentacion m
          WHERE lower(regexp_replace(btrim(a.nombre), '\s+', ' ', 'g')) =
                lower(regexp_replace(btrim(m.alimento_nombre), '\s+', ' ', 'g'))
            AND lower(btrim(u.simbolo)) = lower(btrim(m.unidad_simbolo))
        );

  IF v_no_matriz IS NOT NULL THEN
    RAISE EXCEPTION
      'La migración se detuvo: se detectaron asociaciones nuevas fuera de la matriz: %',
      v_no_matriz;
  END IF;

  -- Las asociaciones agregadas por esta migración son secundarias. Si ya
  -- existían, su estado no se modifica y se respeta el catálogo vigente.
  SELECT string_agg(format('%s -> %s', m.alimento_nombre, m.unidad_simbolo), ', ' ORDER BY m.alimento_nombre, m.unidad_simbolo)
  INTO v_principales_incorrectas
  FROM pg_temp._matriz_unidades_presentacion m
  JOIN public.alimentos a
    ON lower(regexp_replace(btrim(a.nombre), '\s+', ' ', 'g')) =
       lower(regexp_replace(btrim(m.alimento_nombre), '\s+', ' ', 'g'))
  JOIN public.unidades u
    ON lower(btrim(u.simbolo)) = lower(btrim(m.unidad_simbolo))
  JOIN public.alimentos_unidades au
    ON au.alimento_id = a.id
   AND au.unidad_id = u.id
  WHERE au.es_unidad_principal IS DISTINCT FROM false
    AND NOT EXISTS (
      SELECT 1
      FROM pg_temp._auditoria_alimentos_unidades anterior
      WHERE anterior.alimento_id = au.alimento_id
        AND anterior.unidad_id = au.unidad_id
    );

  IF v_principales_incorrectas IS NOT NULL THEN
    RAISE EXCEPTION
      'La migración se detuvo: asociaciones nuevas marcadas como principales: %',
      v_principales_incorrectas;
  END IF;

  -- No se permite perder ni modificar una relación existente.
  SELECT count(*) INTO v_diferencias
  FROM (
    SELECT * FROM pg_temp._auditoria_alimentos_unidades
    EXCEPT ALL
    SELECT * FROM public.alimentos_unidades
  ) diferencias;

  IF v_diferencias <> 0 THEN
    RAISE EXCEPTION
      'La migración se detuvo: se modificaron o eliminaron % relaciones existentes',
      v_diferencias;
  END IF;
END;
$$;

-- Auditoría posterior: las únicas filas nuevas deben estar en
-- alimentos_unidades y ser exactamente las de la matriz declarada.
DO $$
DECLARE
  v_diferencias bigint;
BEGIN
  SELECT count(*) INTO v_diferencias
  FROM (
    (
      SELECT * FROM pg_temp._auditoria_alimentos
      EXCEPT ALL
      SELECT * FROM public.alimentos
    )
    UNION ALL
    (
      SELECT * FROM public.alimentos
      EXCEPT ALL
      SELECT * FROM pg_temp._auditoria_alimentos
    )
  ) diferencias;
  IF v_diferencias <> 0 THEN
    RAISE EXCEPTION 'La migración modificó o eliminó alimentos existentes';
  END IF;

  SELECT count(*) INTO v_diferencias
  FROM (
    (
      SELECT * FROM pg_temp._auditoria_unidades
      EXCEPT ALL
      SELECT * FROM public.unidades
    )
    UNION ALL
    (
      SELECT * FROM public.unidades
      EXCEPT ALL
      SELECT * FROM pg_temp._auditoria_unidades
    )
  ) diferencias;
  IF v_diferencias <> 0 THEN
    RAISE EXCEPTION 'La migración modificó unidades existentes';
  END IF;

  SELECT count(*) INTO v_diferencias
  FROM (
    (
      SELECT * FROM pg_temp._auditoria_productos_donados
      EXCEPT ALL
      SELECT * FROM public.productos_donados
    )
    UNION ALL
    (
      SELECT * FROM public.productos_donados
      EXCEPT ALL
      SELECT * FROM pg_temp._auditoria_productos_donados
    )
  ) diferencias;
  IF v_diferencias <> 0 THEN
    RAISE EXCEPTION 'La migración modificó productos donados históricos';
  END IF;

  SELECT count(*) INTO v_diferencias
  FROM (
    (
      SELECT * FROM pg_temp._auditoria_entradas_inventario
      EXCEPT ALL
      SELECT * FROM public.entradas_inventario
    )
    UNION ALL
    (
      SELECT * FROM public.entradas_inventario
      EXCEPT ALL
      SELECT * FROM pg_temp._auditoria_entradas_inventario
    )
  ) diferencias;
  IF v_diferencias <> 0 THEN
    RAISE EXCEPTION 'La migración modificó entradas de inventario históricas';
  END IF;

  SELECT count(*) INTO v_diferencias
  FROM (
    (
      SELECT * FROM pg_temp._auditoria_donaciones
      EXCEPT ALL
      SELECT * FROM public.donaciones
    )
    UNION ALL
    (
      SELECT * FROM public.donaciones
      EXCEPT ALL
      SELECT * FROM pg_temp._auditoria_donaciones
    )
  ) diferencias;
  IF v_diferencias <> 0 THEN
    RAISE EXCEPTION 'La migración modificó donaciones históricas';
  END IF;

  SELECT count(*) INTO v_diferencias
  FROM (
    (
      SELECT * FROM pg_temp._auditoria_solicitudes
      EXCEPT ALL
      SELECT * FROM public.solicitudes
    )
    UNION ALL
    (
      SELECT * FROM public.solicitudes
      EXCEPT ALL
      SELECT * FROM pg_temp._auditoria_solicitudes
    )
  ) diferencias;
  IF v_diferencias <> 0 THEN
    RAISE EXCEPTION 'La migración modificó solicitudes históricas';
  END IF;

  SELECT count(*) INTO v_diferencias
  FROM (
    (
      SELECT * FROM pg_temp._auditoria_movimientos_inventario
      EXCEPT ALL
      SELECT * FROM public.movimiento_inventario_detalle
    )
    UNION ALL
    (
      SELECT * FROM public.movimiento_inventario_detalle
      EXCEPT ALL
      SELECT * FROM pg_temp._auditoria_movimientos_inventario
    )
  ) diferencias;
  IF v_diferencias <> 0 THEN
    RAISE EXCEPTION 'La migración modificó movimientos de inventario históricos';
  END IF;

  SELECT count(*) INTO v_diferencias
  FROM (
    (
      SELECT * FROM pg_temp._auditoria_conversiones
      EXCEPT ALL
      SELECT * FROM public.conversiones
    )
    UNION ALL
    (
      SELECT * FROM public.conversiones
      EXCEPT ALL
      SELECT * FROM pg_temp._auditoria_conversiones
    )
  ) diferencias;
  IF v_diferencias <> 0 THEN
    RAISE EXCEPTION 'La migración modificó conversiones';
  END IF;
END;
$$;

COMMIT;
