-- El depósito global creado por el seed inicial quedó obsoleto con el modelo
-- de bodegas asociadas a cada donante.
DELETE FROM public.depositos
WHERE id_deposito = '8569abb1-337f-4b16-b58f-6985d4cefcc2'::uuid
  AND nombre = 'Depósito Principal';
