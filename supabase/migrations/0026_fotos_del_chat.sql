-- ============================================
-- 0026: fotos del chat (almacén de archivos) y el hueco para sus datos
-- ============================================
-- Qué arregla (18-09-2026, pedido del usuario): los botones de la bandeja de adjuntos del
-- chat no accedían a nada. Ahora «Fotos» y «Cámara» suben una imagen de verdad y el mensaje
-- lleva su dirección para que el otro la vea; «Ubicación» manda la posición real. Esto es lo
-- que la app necesita del backend:
--   1. un bucket donde vivir las fotos (las rutas empiezan por el id del usuario),
--   2. `messages.metadata`, que es donde el chat de GRUPO guarda la dirección de la foto y
--      las coordenadas de la ubicación (`service_messages` ya tiene `metadata` desde la 0010).
--
-- OJO CON EL ROL: el bucket y sus políticas viven en el esquema `storage`, que pertenece a
-- `supabase_storage_admin`. Si al aplicarla con el dueño de vuestras tablas sale
-- "must be owner of table objects", hay que aplicarla con ESE rol (o activar el bucket y sus
-- políticas desde el panel → Storage). El resto de la migración (la columna) sí va con el
-- dueño de las tablas.
--
--   docker exec -i supabase-db psql -U supabase_storage_admin -d postgres \
--     < supabase/migrations/0026_fotos_del_chat.sql
--
-- El bucket es de LECTURA pública a propósito: la dirección de la foto se manda dentro del
-- mensaje y el otro la abre sin ceremonia. Escribir solo se puede en la carpeta propia.

-- ---------------------------------------------------------------------------
-- 1) El bucket de las fotos del chat
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-adjuntos', 'chat-adjuntos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ---------------------------------------------------------------------------
-- 2) Políticas del bucket
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Fotos del chat: leer" ON storage.objects;
CREATE POLICY "Fotos del chat: leer" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-adjuntos');

-- Cada quien sube SOLO a su carpeta (`<user_id>/<archivo>`): sin esto, cualquier usuario con
-- sesión podría escribir donde quisiera dentro del bucket.
DROP POLICY IF EXISTS "Fotos del chat: subir a la carpeta propia" ON storage.objects;
CREATE POLICY "Fotos del chat: subir a la carpeta propia" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-adjuntos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Fotos del chat: borrar las propias" ON storage.objects;
CREATE POLICY "Fotos del chat: borrar las propias" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-adjuntos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 3) Los datos del adjunto en los mensajes del grupo
-- ---------------------------------------------------------------------------
-- En el chat del servicio ya existe (`service_messages.metadata`, 0010). En el de grupo no:
-- sin esta columna, la foto del grupo no tendría dónde guardar su dirección.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';

-- Comprobación rápida después de aplicar (deben salir 3 políticas y 1 bucket):
--   SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'Fotos%';
--   SELECT id, public FROM storage.buckets WHERE id = 'chat-adjuntos';
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'messages' AND column_name = 'metadata';
