-- ============================================
-- activar_mi_seguimiento.sql — activa el seguimiento del viaje para tu cuenta
-- ============================================
-- Mientras la pantalla del panel no exista, este es el interruptor de prueba: enciende el
-- servicio de seguimiento para la cuenta ADMIN (la tuya) con la marca de la casa
-- (nombre y colores se cambian luego desde el panel; esto es solo para probar el circuito).
--
-- Es seguro repetirlo: si la fila ya existía, la vuelve a encender.
--
-- Aplicar con (una línea, desde la carpeta supabase):
--   cat activar_mi_seguimiento.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

INSERT INTO public.marcas_del_seguimiento (profile_id, activo, color_principal, color_secundario)
SELECT id, TRUE, '#2D2D2D', '#9AA0A6'
FROM public.profiles WHERE role = 'ADMIN' LIMIT 1
ON CONFLICT (profile_id) DO UPDATE
  SET activo = TRUE,
      actualizado_at = now();

COMMIT;

-- Quién quedó con el seguimiento encendido:
SELECT p.phone AS cuenta, p.role AS rol, m.activo AS seguimiento_activo, m.color_principal
FROM public.marcas_del_seguimiento m
JOIN public.profiles p ON p.id = m.profile_id;
