-- ============================================
-- 0011: tiempo real de las tarjetas de servicio
-- ============================================
-- Síntoma del usuario: "las tarjetas nuevas y las anuladas no se actualizan en
-- tiempo real en los dos dispositivos". Dos causas en la base:
--
-- 1. La tabla tiene que estar en la publicación `supabase_realtime`; si no, el
--    servidor no emite NADA (el cliente se suscribe y nunca recibe eventos).
--    La 0010 ya la añadía; aquí se repite por si esa migración no se aplicó y se
--    cubren también las tablas que usa el resto de la app.
-- 2. Con `REPLICA IDENTITY DEFAULT`, un DELETE viaja **solo con la clave
--    primaria**, sin las demás columnas: el cliente no puede autorizar la fila
--    contra las políticas RLS y Supabase Realtime descarta el evento. Con
--    `REPLICA IDENTITY FULL` el evento lleva la fila vieja completa y el borrado
--    se propaga (es lo que hace que una tarjeta anulada desaparezca al instante).

DO $$
DECLARE
  tabla text;
  publicables text[] := ARRAY[
    'public.service_alerts',
    'public.applications',
    'public.messages',
    'public.groups',
    'public.group_members',
    'public.service_messages'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH tabla IN ARRAY publicables LOOP
    -- Se salta las tablas que aún no existan (p. ej. service_messages sin la 0010).
    IF to_regclass(tabla) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname || '.' || tablename = tabla
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', tabla);
    END IF;
  END LOOP;
END $$;

-- Fila completa en los eventos (necesario para autorizar DELETE con RLS).
ALTER TABLE public.service_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.applications REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF to_regclass('public.service_messages') IS NOT NULL THEN
    ALTER TABLE public.service_messages REPLICA IDENTITY FULL;
  END IF;
END $$;

-- Comprobar el resultado (debe listar las tablas y la identidad `f` = FULL):
--   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--   SELECT relname, relreplident FROM pg_class
--   WHERE relname IN ('service_alerts','applications','messages','service_messages');
