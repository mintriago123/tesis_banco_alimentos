BEGIN;

-- Estas funciones nunca tuvieron lógica de negocio ni llamadas activas. Eliminar
-- sus definiciones también elimina los privilegios asociados en PostgreSQL.
DROP FUNCTION IF EXISTS public.cancelar_eliminacion_categoria(uuid, uuid);
DROP FUNCTION IF EXISTS public.procesar_eliminaciones_categorias_pendientes();

COMMIT;
