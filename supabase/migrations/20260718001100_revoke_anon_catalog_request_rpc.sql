BEGIN;

REVOKE ALL ON FUNCTION public.aprobar_solicitud_alta_alimento(uuid, text, text, bigint[], bigint) FROM anon;
REVOKE ALL ON FUNCTION public.aprobar_solicitud_alta_alimento(uuid, text, text, bigint[], bigint) FROM PUBLIC;

COMMIT;
