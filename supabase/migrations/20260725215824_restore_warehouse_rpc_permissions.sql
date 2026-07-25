BEGIN;

-- Los wrappers públicos son SECURITY INVOKER y delegan en estas funciones
-- privadas SECURITY DEFINER. El rol autenticado necesita EXECUTE para que la
-- solicitud de alta/modificación llegue al helper correspondiente.
GRANT EXECUTE ON FUNCTION private_auth.crear_solicitud_bodega(
  text, text, text, text, text, uuid, double precision, double precision
) TO authenticated;

GRANT EXECUTE ON FUNCTION private_auth.aprobar_solicitud_bodega(uuid)
  TO authenticated;

COMMIT;
