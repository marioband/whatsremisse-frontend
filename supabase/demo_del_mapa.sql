-- ============================================
-- demo_del_mapa.sql — un viaje de demostración para VER la página del mapa
-- ============================================
-- Crea:
--   * un conductor de práctica (cuenta de mentira con datos de unidad: marca, modelo, color y placa);
--   * el viaje de demostración (archivado: no aparece en las listas de la app) con el TRAZO REAL
--     de la ruta por calles (Av. Javier Prado -> Aeropuerto Jorge Chávez, medido con OSRM);
--   * su link público y la posición inicial de la unidad.
--
-- Se puede correr varias veces (primero borra el demo anterior). Para quitarlo del todo:
-- quitar_demo_del_mapa.sql
--
-- Aplicar con (una línea, desde la carpeta supabase):
--   cat demo_del_mapa.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

DELETE FROM public.seguimientos_del_viaje WHERE token = 'demo-del-mapa';
DELETE FROM public.seguimiento_posiciones WHERE service_id = 'a0000000-0000-4000-8000-00000000d3e0';
DELETE FROM public.service_alerts WHERE id = 'a0000000-0000-4000-8000-00000000d3e0';

DO $$
DECLARE
  v_proveedor UUID;
  v_conductor UUID := 'a0000000-0000-4000-8000-00000000d3d1';  -- la cuenta de práctica
  v_nombre TEXT;
BEGIN
  SELECT id INTO v_proveedor FROM public.profiles WHERE role = 'ADMIN' LIMIT 1;

  -- El conductor de práctica. Si la tabla de cuentas no aceptara esta inserción (varía según la
  -- versión de la puerta de autenticación), el demo se arma igual con tu cuenta como conductor.
  BEGIN
    INSERT INTO auth.users (id, instance_id, aud, role, email, phone, created_at, updated_at)
    VALUES (v_conductor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            NULL, NULL, now(), now())
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo crear el conductor de práctica (%): el demo usará tu cuenta', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_conductor) THEN
    UPDATE public.profiles
       SET full_name = 'Julio C. Demo',
           vehicle_data = '{"brand": "Toyota", "model": "Corolla", "color": "Blanco perla", "plate": "V1A-234"}'::jsonb
     WHERE id = v_conductor;
    v_nombre := 'conductor de práctica (Julio C. Demo)';
  ELSE
    v_conductor := v_proveedor;
    v_nombre := 'tu cuenta (sin datos de unidad)';
  END IF;

  INSERT INTO public.service_alerts (
    id, provider_id, title, description, origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng, status,
    assigned_driver_id, driver_progress_step, archived, trazo_polyline
  ) VALUES (
    'a0000000-0000-4000-8000-00000000d3e0'::uuid, v_proveedor,
    'Viaje de demostración (para ver el mapa)',
    'Creado por demo_del_mapa.sql — se borra con quitar_demo_del_mapa.sql.',
    'Av. Javier Prado Este 2000, San Borja, Lima', -12.0865, -76.9964,
    'Aeropuerto Internacional Jorge Chávez, Callao', -12.0219, -77.1143,
    'STATUS_IN_PROGRESS', v_conductor, 2, TRUE,
    'nswhAnj}tMD^@JQ@wBLM@yBPQBG?M@C@G?qAJ{CRI@k@DO@oALq@FW@SBK@_@@QBs@DaAN{@Pg@Pg@PeEjBiAh@mCpAcAf@OHSJcBz@_Ad@mAl@}@f@wFjCqAp@GFMDQHcEtBuBbAiAj@y@`@OHUJKFm@XCBMFIDYLIDc@R{@b@o@ZULa@POHE@OJC@_Ah@GFUPc@`@KJGFm@n@a@b@c@`@q@t@EDCBk@h@i@j@YXMJWVIHONIHKJEDa@a@wBaBCAyIqF}ByA_@UqAu@mDyB{@i@YQGECASKGTKXK^Md@Sj@Qp@Up@Ut@m@fBCFABMR[b@qAfBcB|BMP{@hAQP@NAJYb@kB`Ca@b@UVMLSVORe@l@yErGUZ{BzC_B|BaDlEGHmAbB[`@e@n@GJCBYSSQiAy@cCgBKIECIEEHMXAHGJQZQTQZY^]l@wAxBMNIDQFKLGJEDM`@On@GVADAB?@a@dBIZI\CHKd@ABI\GVGVANCZAFCTC^Cj@Ej@ARC^CX?JE`@?@AJAJAT?JANANABAX?@?RAHCt@ANATAz@iAFQ@g@DI?UBm@DY@k@DO@M@W@[Ba@BQ@i@D]@WB]BQ@g@Bq@DE@QBM@MBUDk@JG@SBQBY@K?IAYCsB]C?e@IQC{@OEAWCMCQC]Ks@SOEMEQESA[CSAY?Q?O?O?SBa@D_@DUDYFmA`@E@EB]_AGOIUAC?G?G?I?I@IBKDMFIHIFEHEHCHAHAJ?H@H@F@HDDDHJBFDHDHBHBH@F@H@J?HB`@@l@Fh@MzA?R?HAb@?fADtBTjGV|FCzE]|IEtGEnCKbAGz@Mh@[lAoAlDcA|CyBfF{CnHkB`EmArC]x@KVUh@}@zB]bAUv@g@|BStAKt@MxAG`BG|CMtBE\GVm@dBs@xAwAjCmBlDqB~D[n@Of@YfAIn@Gb@C`@E|@Av@b@dNFz@Hd@Hd@XbA\~@hArDH\F\Db@Bb@?h@Cf@G`AS~AM`AK|@K~@Ez@L|DBf@AdAE~@SnBaAhGs@jE[xBGd@Iz@KbAQ~Ce@jJy@hROnBc@fGGdAIjCAzAAvBHxDJhB@RNbBPvARpBd@pEdAjJd@fEbC|Sp@|F@N@F@D@Jf@hEZrCJz@h@`FHr@`@tD^~C@PBL@Pf@fEv@hHBXBNBVlAxKHn@jAzKBTJbAVzB^nDPxAPz@H\Nb@d@dALVI?YB_CJo@@q@?MAOAi@Ee@AYAY@qADkAD]?]B}AFu@D[@U@k@@[@I?E@KBwAVgATYDaAV}@Ts@TWHMDC@CBGDABGFY^KFKFOHi@RcDnA_A\SFYDW@m@H_@DG@QF]L]LYLOFIFEFEHINILMNULSHuIdDa@PSJIFKJIJONOJOFyB|@wEvB{At@[PyBbAA@e@TUBSBU@S@QDeBn@a@PUHE?E@MB{@Lu@JM@o@Nk@Ti@ZEBKHGJGR?BMZKLKHOHE@YJYJg@Ta@Nc@P[PQJYL]Ns@XQFM@QBW@Q?MBSBMDGBSHuCfAwCfAEBAJ?D?DBJPb@DNBHn@`BTl@l@zAVIHP'
  );

  INSERT INTO public.seguimientos_del_viaje (token, service_id, creado_por, expira_at)
  VALUES ('demo-del-mapa', 'a0000000-0000-4000-8000-00000000d3e0'::uuid, v_proveedor,
          now() + interval '7 days');

  INSERT INTO public.seguimiento_posiciones (service_id, lat, lng)
  VALUES ('a0000000-0000-4000-8000-00000000d3e0'::uuid, -12.0855, -77.0008);

  RAISE NOTICE 'Demo listo. Conductor del viaje: %', v_nombre;
END $$;

COMMIT;

SELECT 'https://whatsremisse.tech/viaje/demo-del-mapa' AS abrir_en_el_telefono,
       'demo: se quita con quitar_demo_del_mapa.sql' AS nota;
