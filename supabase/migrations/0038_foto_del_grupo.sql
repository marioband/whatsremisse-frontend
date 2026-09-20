-- 0038: la foto (avatar) del grupo.
--
-- Hasta ahora los grupos se pintaban SIEMPRE con su inicial en un círculo: no existía ninguna
-- columna donde guardar una foto. La pantalla «Nuevo grupo» mostraba un 📷 que, al tocarlo, solo
-- abría un aviso que decía «Selecciona un avatar para el grupo» — un aviso que prometía algo que la
-- app no tenía (pedido del usuario, 20-09-2026: «para seleccionar avatar habría que seleccionar el
-- apartado donde va la imagen del grupo»).
--
-- Esta migración añade el sitio donde vive esa foto. Es OPCIONAL: sin ella, la app sigue igual que
-- hoy (los grupos se crean y se ven con su inicial), porque el cliente reintenta sus consultas sin
-- la columna. Al aplicarla, la foto del grupo se guarda y se muestra en «Mis grupos».
--
-- El archivo NO trae el almacén: `lib/adjuntos.subirFoto` sube la imagen al mismo bucket y con las
-- mismas reglas que las fotos de perfil y de empresa, así que no hace falta ninguna política nueva.

alter table public.groups add column if not exists avatar_url text;

comment on column public.groups.avatar_url is
  'URL publica de la foto del grupo (0038). Vacio o nulo = el grupo se pinta con su inicial.';
