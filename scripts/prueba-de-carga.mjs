#!/usr/bin/env node
/**
 * Prueba de carga: ¿aguanta la app el ritmo que queremos?
 *
 * Responde a la pregunta del usuario (21-09-2026): «¿cómo sabemos si la app está preparada para
 * 20 creaciones de servicios por minuto o 30 postulaciones por minuto?».
 *
 * NO se adivina: se mide, con el mismo camino que usa la app (PostgREST → Postgres, con sus
 * disparadores y sus avisos) y con teléfonos de verdad pidiendo lo que pide la app cada 15 s.
 *
 * CÓMO SE USA (en el VPS, dentro de la carpeta del repositorio):
 *   node scripts/prueba-de-carga.mjs --simulado     ← solo dice lo que haría (no escribe nada)
 *   node scripts/prueba-de-carga.mjs --si           ← prueba de verdad (crea datos de PRUEBA y los borra)
 *
 * Opciones:
 *   --si                 obligatorio para que escriba algo (sin esto solo planifica)
 *   --minutos 2          cuántos minutos dura cada ritmo (por defecto 2)
 *   --telefonos 10       cuántas apps abiertas se simulan a la vez (por defecto 10)
 *   --segundos-lectura 30  cuánto dura la fase de teléfonos (por defecto 30)
 *
 * LO QUE HACE:
 *   1) Crea usuarios y un grupo de PRUEBA (correo `carga-…@prueba.whatsremisse.tech`).
 *   2) Crea servicios al ritmo pedido (por defecto 20/minutos) y mide lo que tarda cada uno.
 *   3) Crea postulaciones al ritmo pedido (por defecto 30/minutos) y mide lo que tarda cada una.
 *   4) Simula N apps abiertas: cada una pide lo mismo que la app real cada 15 s (6 consultas).
 *   5) Dice los tiempos (mediana, p95 y el peor), los fallos y cuántos avisos quedaron en la cola.
 *   6) BORRA todo lo que creó (servicios, grupo, usuarios, perfiles) y los avisos de la prueba.
 *
 * Lo que NO mide: la CPU del servidor. Para eso, en otra terminal mientras corre:
 *   docker stats --no-stream
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Lee el `.env` sin depender de la versión de Node (mismo camino que `enviar-avisos.mjs`). */
function leerEnv() {
  const env = { ...process.env };
  try {
    const texto = readFileSync(join(RAIZ, '.env'), 'utf8');
    for (const linea of texto.split('\n')) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith('#')) continue;
      const corte = limpia.indexOf('=');
      if (corte < 1) continue;
      let valor = limpia.slice(corte + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      const clave = limpia.slice(0, corte).trim();
      if (!env[clave]) env[clave] = valor;
    }
  } catch {
    // Sin .env: se usan las variables de entorno.
  }
  return env;
}

const env = leerEnv();
const URL_BASE = (env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const CLAVE_SERVICIO = env.SUPABASE_SERVICE_ROLE_KEY || '';
const CLAVE_PUBLICA = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : porDefecto;
};
const CONFIRMADO = args.includes('--si');
const SIMULADO = args.includes('--simulado');
const MINUTOS = opcion('minutos', 2);
const TELEFONOS = opcion('telefonos', 10);
const SEGUNDOS_LECTURA = opcion('segundos-lectura', 30);

// ---------------------------------------------------------------------------
// Reloj de la corrida (22-09-2026)
// ---------------------------------------------------------------------------
// Las dos corridas reales (21 y 22-09) tardaron ~2 HORAS cuando el plan de este script son ~5 min, y
// no había manera de saber dónde se iba el tiempo: solo se cronometraban las llamadas de la app
// (crear / postular / leer). Las de preparar (altas de usuario, entrar, grupo) y las de BORRAR no se
// medían, y son justo las que NO dependen de la app. Ahora cada sección dice en qué segundo empieza y
// toda llamada que pase de 1 s deja su tiempo en el informe.
const ARRANQUE = Date.now();
const segundos = () => Math.round((Date.now() - ARRANQUE) / 1000);

/** Letra y barras para el informe (con el segundo de la corrida, para ver dónde se va el tiempo). */
const linea = (t = '') => console.log(t);
const titulo = (t) => {
  linea('');
  linea(`== ${t} ==   [t+${segundos()} s]`);
};

/** `pedir` dejando dicho cuánto tardó: es para las llamadas que antes NO se medían. */
async function pedirConReloj(ruta, etiqueta, opciones) {
  const antes = Date.now();
  const r = await pedir(ruta, opciones);
  const s = (Date.now() - antes) / 1000;
  if (s > 1 || r.error) {
    linea(`      [t+${segundos()} s] ${etiqueta}: ${s.toFixed(1)} s${r.error ? ` — ${r.error}` : ''}`);
  }
  return r;
}

/** Los tiempos de cada operación, para poder dar mediana/p95/peor. */
class Tiempos {
  constructor(nombre) {
    this.nombre = nombre;
    this.valores = [];
    this.fallos = 0;
    this.motivos = new Map();
  }
  apunta(ms, error) {
    if (error) {
      this.fallos += 1;
      const clave = String(error).slice(0, 120);
      this.motivos.set(clave, (this.motivos.get(clave) || 0) + 1);
      return;
    }
    this.valores.push(ms);
  }
  get percentil() {
    const orden = [...this.valores].sort((a, b) => a - b);
    const p = (q) => (orden.length ? orden[Math.min(orden.length - 1, Math.floor(q * orden.length))] : 0);
    return { mediana: p(0.5), p95: p(0.95), peor: orden.length ? orden[orden.length - 1] : 0, cuantas: orden.length };
  }
  informe() {
    const { mediana, p95, peor, cuantas } = this.percentil;
    linea(
      `   ${this.nombre}: ${cuantas} medidas → mediana ${mediana} ms · p95 ${p95} ms · peor ${peor} ms` +
        (this.fallos ? ` · ${this.fallos} FALLOS` : '')
    );
    for (const [motivo, veces] of this.motivos) linea(`      ${veces}× ${motivo}`);
  }
}

/** Una llamada HTTP en crudo, midiendo lo que tarda y sin morir si falla. */
async function intento(ruta, { metodo, cuerpo, cabecera, prefer }) {
  const cabeceras = {
    apikey: CLAVE_PUBLICA || CLAVE_SERVICIO,
    Authorization: `Bearer ${cabecera}`,
    'Content-Type': 'application/json',
  };
  if (prefer) cabeceras.Prefer = prefer;
  const inicio = Date.now();
  try {
    const respuesta = await fetch(`${URL_BASE}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      // Sin tope, una llamada que se cuelga no deja rastro: se espera para siempre y la corrida se va
      // en silencio (las 2 h del 22-09). Con esto, a los 2 min se cae y queda dicho en el informe.
      signal:
        typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? AbortSignal.timeout(120000)
          : undefined,
    });
    const texto = await respuesta.text();
    const ms = Date.now() - inicio;
    if (!respuesta.ok) return { ms, error: `${respuesta.status} ${texto.slice(0, 120)}` };
    return { ms, dato: texto ? JSON.parse(texto) : null };
  } catch (err) {
    return { ms: Date.now() - inicio, error: String(err?.message || err) };
  }
}

/**
 * Una llamada HTTP midiendo lo que tarda. Con `usuario` usa SU sesión (el mismo camino que la app)
 * y, si el token se venció (el proyecto los caduca antes de lo que dura la prueba: `JWT expired`),
 * lo renueva y repite la llamada una vez — así una prueba de 5 minutos no se queda sin medir por
 * eso (pasó en la primera corrida, 21-09-2026).
 */
async function pedir(ruta, { metodo = 'GET', cuerpo, token, usuario, prefer } = {}) {
  const opciones = { metodo, cuerpo, prefer };
  if (usuario) {
    if (usuario.expira_at && usuario.expira_at - Date.now() < 30000) await renovar(usuario);
    const primera = await intento(ruta, { ...opciones, cabecera: usuario.access_token });
    if (!primera.error || !/JWT expired|PGRST303|invalid claim/i.test(primera.error)) return primera;
    const ok = await renovar(usuario);
    if (!ok) return primera;
    return intento(ruta, { ...opciones, cabecera: usuario.access_token });
  }
  return intento(ruta, { ...opciones, cabecera: token || CLAVE_SERVICIO || CLAVE_PUBLICA });
}

/** Renueva la sesión de ese usuario (primero con su `refresh_token`, y si no, entrando otra vez). */
async function renovar(usuario) {
  if (usuario.renovando) return usuario.renovando;
  usuario.renovando = (async () => {
    try {
      if (usuario.refresh_token) {
        const r = await intento('/auth/v1/token?grant_type=refresh_token', {
          metodo: 'POST',
          cuerpo: { refresh_token: usuario.refresh_token },
          cabecera: CLAVE_PUBLICA,
        });
        if (!r.error) {
          guardarSesion(usuario, r.dato);
          return true;
        }
      }
      await entrar(usuario);
      return true;
    } catch {
      return false;
    } finally {
      usuario.renovando = null;
    }
  })();
  return usuario.renovando;
}

/** Deja la sesión del usuario lista para usarla (token, refresh y cuándo caduca). */
function guardarSesion(usuario, sesion) {
  usuario.access_token = sesion.access_token;
  usuario.refresh_token = sesion.refresh_token || usuario.refresh_token;
  const segundos = Number(sesion.expires_in) || 3600;
  usuario.expira_at = Date.now() + segundos * 1000;
}

/** Crea un usuario de prueba (el disparador de 0001 le crea el perfil solo). */
async function crearUsuario(indice) {
  const correo = `carga-${Date.now()}-${indice}@prueba.whatsremisse.tech`;
  const clave = `Carga${Date.now()}${indice}!`;
  const alta = await pedirConReloj('/auth/v1/admin/users', `alta del usuario de prueba ${indice + 1}`, {
    metodo: 'POST',
    cuerpo: { email: correo, password: clave, email_confirm: true },
  });
  if (alta.error) throw new Error(`no se pudo crear el usuario de prueba: ${alta.error}`);
  return { id: alta.dato.id, correo, clave };
}

/** Entra como ese usuario (el mismo camino que la app) y le deja la sesión guardada. */
async function entrar(usuario) {
  const entrada = await pedirConReloj('/auth/v1/token?grant_type=password', `entrar como ${usuario.correo}`, {
    metodo: 'POST',
    cuerpo: { email: usuario.correo, password: usuario.clave },
    token: CLAVE_PUBLICA,
  });
  if (entrada.error) throw new Error(`no se pudo entrar como ${usuario.correo}: ${entrada.error}`);
  guardarSesion(usuario, entrada.dato);
  return usuario.access_token;
}

/** Espera a que llegue el momento (para clavar el ritmo pedido). */
const esperarHasta = (momento) =>
  new Promise((listo) => setTimeout(listo, Math.max(0, momento - Date.now())));

/** Borra todo lo que dejó una prueba: primero los grupos (no se van con el usuario), luego los
 * usuarios de prueba (con ellos caen sus perfiles, servicios, postulaciones y mensajes) y antes los
 * avisos que iban dirigidos a ellos, para que el programa de avisos no los reintente. */
async function limpiar({ serviciosCreados = [], usuarios = [], grupoId = null, avisoIdInicial = -1 } = {}) {
  const antesBorrado = Date.now();
  for (const id of serviciosCreados) {
    await pedirConReloj(`/rest/v1/service_alerts?id=eq.${id}`, 'borrar un servicio de prueba', {
      metodo: 'DELETE',
    });
  }
  linea(
    `   ${serviciosCreados.length} servicios de prueba borrados (con sus postulaciones): ` +
      `${((Date.now() - antesBorrado) / 1000).toFixed(1)} s`
  );
  const idsUsuarios = usuarios.map((u) => u.id);
  if (avisoIdInicial >= 0 && idsUsuarios.length) {
    await pedirConReloj(
      `/rest/v1/avisos_cola?id=gt.${avisoIdInicial}&destinatarios=cs.{${idsUsuarios.join(',')}}`,
      'borrar los avisos de prueba',
      { metodo: 'DELETE' }
    );
    linea('   avisos de la prueba borrados.');
  }
  if (grupoId) {
    await pedirConReloj(`/rest/v1/groups?id=eq.${grupoId}`, 'borrar el grupo de prueba', {
      metodo: 'DELETE',
    });
    linea('   grupo de prueba borrado.');
  }
  for (const u of usuarios) {
    await pedirConReloj(`/auth/v1/admin/users/${u.id}`, `borrar el usuario de prueba ${u.correo}`, {
      metodo: 'DELETE',
    });
  }
  linea(`   ${usuarios.length} usuarios de prueba borrados.`);
}

/** Los usuarios que dejó una prueba cortada (por correo) y sus grupos. */
async function restosDePruebas() {
  const listado = await pedir('/auth/v1/admin/users?page=1&per_page=1000');
  if (listado.error) throw new Error(`no se pudo leer la lista de usuarios: ${listado.error}`);
  const usuarios = (listado.dato?.users || []).filter((u) =>
    String(u.email || '').endsWith('@prueba.whatsremisse.tech')
  );
  const grupos = await pedir(
    `/rest/v1/groups?select=id&name=eq.${encodeURIComponent('Grupo de prueba (carga)')}`
  );
  return { usuarios, grupos: grupos.dato || [] };
}

/** `--limpiar`: borra lo que haya quedado de una prueba anterior (por si se cortó). */
async function limpiarRestos() {
  titulo('Limpiando restos de pruebas anteriores');
  const { usuarios, grupos } = await restosDePruebas();
  linea(`   ${usuarios.length} usuarios de prueba y ${grupos.length} grupos encontrados.`);
  for (const g of grupos) await pedir(`/rest/v1/groups?id=eq.${g.id}`, { metodo: 'DELETE' });
  for (const u of usuarios) await pedir(`/auth/v1/admin/users/${u.id}`, { metodo: 'DELETE' });
  linea('   borrado. Si no queda nada que borrar, ya estaba limpio.');
}

async function principal() {
  titulo('Prueba de carga de WhatsRemisse');
  linea(`   Proyecto: ${URL_BASE || '(sin dirección en el .env)'}`);
  linea(`   Ritmo de servicios:      20 por minuto durante ${MINUTOS} min (${20 * MINUTOS} servicios)`);
  linea(`   Ritmo de postulaciones:  30 por minuto durante ${MINUTOS} min (${30 * MINUTOS} postulaciones)`);
  linea(`   Apps abiertas simuladas: ${TELEFONOS} durante ${SEGUNDOS_LECTURA} s`);

  if (args.includes('--limpiar')) {
    if (!URL_BASE || !CLAVE_SERVICIO) {
      linea('\nFalta la dirección del proyecto o la clave de servicio en el .env. Nada que hacer.');
      process.exit(1);
    }
    await limpiarRestos();
    process.exit(0);
  }

  if (SIMULADO || !CONFIRMADO) {
    linea(
      '\nEsto es solo el PLAN: no se ha escrito nada.\n' +
        (CLAVE_SERVICIO
          ? ''
          : 'OJO: falta SUPABASE_SERVICE_ROLE_KEY en el .env (la misma que usa `enviar-avisos.mjs`).\n') +
        (URL_BASE ? '' : 'OJO: falta EXPO_PUBLIC_SUPABASE_URL en el .env.\n') +
        'Para hacer la prueba de verdad (crea datos de PRUEBA y los borra al terminar):\n' +
        '   node scripts/prueba-de-carga.mjs --si'
    );
    process.exit(0);
  }
  if (!URL_BASE || !CLAVE_SERVICIO) {
    linea('\nFalta la dirección del proyecto o la clave de servicio en el .env. Nada que hacer.');
    process.exit(1);
  }

  const tiemposServicios = new Tiempos('Crear un servicio');
  const tiemposCompartir = new Tiempos('Compartirlo a un grupo');
  const tiemposPostulaciones = new Tiempos('Postularse (las 3 llamadas que hace la app)');
  const tiemposLecturas = new Map();

  try {
    // ------------------------------------------------------------------ preparación
    titulo('1) Preparación (usuarios y grupo de prueba)');
    const antesPreparacion = Date.now();
    const cuantos = Math.max(2, TELEFONOS);
    for (let i = 0; i < cuantos; i += 1) ESTADO.usuarios.push(await crearUsuario(i));
    const proveedor = ESTADO.usuarios[0];
    await pedirConReloj(`/rest/v1/profiles?id=eq.${proveedor.id}`, 'marcar el proveedor de prueba', {
      metodo: 'PATCH',
      cuerpo: { role: 'PROVIDER', full_name: 'Proveedor de prueba (carga)' },
    });
    ESTADO.usuarios[0].esProveedor = true;
    for (let i = 1; i < ESTADO.usuarios.length; i += 1) {
      await pedirConReloj(
        `/rest/v1/profiles?id=eq.${ESTADO.usuarios[i].id}`,
        `marcar al conductor de prueba ${i}`,
        { metodo: 'PATCH', cuerpo: { role: 'DRIVER', full_name: `Conductor de prueba ${i}` } }
      );
    }
    linea(`   ${ESTADO.usuarios.length} usuarios de prueba creados (el primero es el proveedor).`);

    const creado = await pedirConReloj('/rest/v1/groups', 'crear el grupo de prueba', {
      metodo: 'POST',
      cuerpo: { name: 'Grupo de prueba (carga)', owner_id: proveedor.id },
      prefer: 'return=representation',
    });
    ESTADO.grupoId = creado.dato?.[0]?.id;
    if (!ESTADO.grupoId) throw new Error(`no se pudo crear el grupo de prueba: ${creado.error}`);
    for (const u of ESTADO.usuarios) {
      await pedirConReloj('/rest/v1/group_members', `meter al integrante ${u.correo}`, {
        metodo: 'POST',
        cuerpo: { group_id: ESTADO.grupoId, user_id: u.id, role: u.esProveedor ? 'owner' : 'member' },
      });
    }
    for (const u of ESTADO.usuarios) await entrar(u);
    linea(`   Grupo de prueba creado y ${ESTADO.usuarios.length} integrantes dentro.`);
    linea(`   (preparación: ${((Date.now() - antesPreparacion) / 1000).toFixed(1)} s de las llamadas que antes no se medían)`);

    // Un aviso de referencia para saber cuáles son de la prueba.
    const antes = await pedir('/rest/v1/avisos_cola?select=id&order=id.desc&limit=1');
    ESTADO.avisoIdInicial = antes.dato?.[0]?.id ?? 0;

    // ------------------------------------------------------------------ fase 1: servicios
    titulo(`2) Creando servicios (20 por minuto durante ${MINUTOS} min)`);
    const cuantosServicios = 20 * MINUTOS;
    for (let i = 0; i < cuantosServicios; i += 1) {
      const momento = Date.now() + (i * 60000) / 20;
      await esperarHasta(momento);
      const servicio = await pedir('/rest/v1/service_alerts', {
        metodo: 'POST',
        usuario: proveedor,
        prefer: 'return=representation',
        cuerpo: {
          provider_id: proveedor.id,
          group_id: ESTADO.grupoId,
          title: `Prueba de carga ${i + 1} — San Isidro a Callao`,
          origin_address: 'Av. Prueba 100, San Isidro',
          destination_address: 'Av. Prueba 200, Callao',
          fare: 20,
          status: 'STATUS_OPEN',
        },
      });
      tiemposServicios.apunta(servicio.ms, servicio.error);
      const id = servicio.dato?.[0]?.id;
      if (!id) continue;
      ESTADO.serviciosCreados.push(id);
      // La app comparte el servicio al grupo por la FUNCIÓN de la 0018 (la tabla solo deja leer;
      // el intento directo lo rechaza RLS, como debe). Es la segunda escritura real.
      const compartido = await pedir('/rest/v1/rpc/compartir_servicio_con_grupos', {
        metodo: 'POST',
        usuario: proveedor,
        cuerpo: { p_service_id: id, p_group_ids: [ESTADO.grupoId] },
      });
      tiemposCompartir.apunta(compartido.ms, compartido.error);
      process.stdout.write('.');
    }
    linea('');
    tiemposServicios.informe();
    tiemposCompartir.informe();

    // ------------------------------------------------------------------ fase 2: postulaciones
    titulo(`3) Postulándose (30 por minuto durante ${MINUTOS} min)`);
    const conductores = ESTADO.usuarios.filter((u) => !u.esProveedor);
    const cuantasPostulaciones = 30 * MINUTOS;
    for (let i = 0; i < cuantasPostulaciones; i += 1) {
      const momento = Date.now() + (i * 60000) / 30;
      await esperarHasta(momento);
      const servicio = ESTADO.serviciosCreados[i % ESTADO.serviciosCreados.length];
      const conductor = conductores[i % conductores.length];
      if (!servicio || !conductor) break;
      // La app, antes de postular, MIRA el estado real (2 lecturas) y después hace el upsert:
      // 3 llamadas por postulación. Se miden las tres juntas, que es lo que cuesta de verdad.
      const arranque = Date.now();
      const estado = await pedir(
        `/rest/v1/service_alerts?select=status,assigned_driver_id&id=eq.${servicio}`,
        { usuario: conductor }
      );
      const mia = await pedir(
        `/rest/v1/applications?select=*&service_id=eq.${servicio}&driver_id=eq.${conductor.id}`,
        { usuario: conductor }
      );
      const yaAceptado = mia.dato?.[0]?.status === 'APPROVED' && estado.dato?.[0]?.assigned_driver_id === conductor.id;
      let error = estado.error || mia.error;
      if (!error && !estado.dato?.[0]?.assigned_driver_id && !yaAceptado) {
        const postulacion = await pedir('/rest/v1/applications?on_conflict=service_id,driver_id', {
          metodo: 'POST',
          usuario: conductor,
          prefer: 'resolution=merge-duplicates,return=representation',
          cuerpo: { service_id: servicio, driver_id: conductor.id, status: 'PENDING' },
        });
        error = postulacion.error;
      }
      tiemposPostulaciones.apunta(Date.now() - arranque, error);
      process.stdout.write('.');
    }
    linea('');
    tiemposPostulaciones.informe();

    // Los avisos que apuntaron los disparadores se miran AHORA: el programa del VPS los intenta cada
    // 5 s y a los que no puede entregar (estos usuarios de prueba no tienen teléfono) los borra tras
    // 5 intentos. Al final de la prueba ya no quedaría ninguno.
    const enCola = await pedir(
      `/rest/v1/avisos_cola?select=id&enviado_at=is.null&id=gt.${ESTADO.avisoIdInicial}`
    );
    ESTADO.avisosEnCola = (enCola.dato || []).length;
    linea(`   Avisos apuntados en la cola al terminar: ${ESTADO.avisosEnCola}`);

    // ------------------------------------------------------------------ fase 3: teléfonos
    titulo(`4) ${TELEFONOS} apps abiertas pidiendo lo de cada 15 s, durante ${SEGUNDOS_LECTURA} s`);
    for (const nombre of [
      'mis grupos (group_members)',
      'servicios asignados (service_alerts)',
      'alertas de mis grupos (service_alerts)',
      'mis postulaciones (applications)',
      'postulaciones de mis servicios (applications)',
      'contador de sin leer del chat (rpc)',
    ]) {
      tiemposLecturas.set(nombre, new Tiempos(nombre));
    }
    const finLectura = Date.now() + SEGUNDOS_LECTURA * 1000;
    const telefonos = ESTADO.usuarios.slice(0, TELEFONOS);
    // Los servicios que publicó el proveedor de prueba: su teléfono los tiene ya cargados, así que
    // pedir SUS postulaciones no añade ninguna consulta nueva al bucle (no se vuelve a pedir la lista).
    const serviciosDelProveedor = ESTADO.serviciosCreados;
    await Promise.all(
      telefonos.map(async (u) => {

        while (Date.now() < finLectura) {
          const grupos = await pedir(
            `/rest/v1/group_members?select=group_id,role,favorite,muted,groups(id,name,owner_id,avatar_url)&user_id=eq.${u.id}`,
            { usuario: u }
          );
          tiemposLecturas.get('mis grupos (group_members)').apunta(grupos.ms, grupos.error);
          const idsGrupos = (grupos.dato || []).map((f) => f.group_id);

          const asignados = await pedir(
            `/rest/v1/service_alerts?select=*&assigned_driver_id=eq.${u.id}`,
            { usuario: u }
          );
          tiemposLecturas.get('servicios asignados (service_alerts)').apunta(asignados.ms, asignados.error);

          if (idsGrupos.length) {
            const delGrupo = await pedir(
              `/rest/v1/service_alerts?select=*&group_id=in.(${idsGrupos.join(',')})`,
              { usuario: u }
            );
            tiemposLecturas.get('alertas de mis grupos (service_alerts)').apunta(delGrupo.ms, delGrupo.error);
          }

          const mias = await pedir(`/rest/v1/applications?select=*&driver_id=eq.${u.id}`, { usuario: u });
          tiemposLecturas.get('mis postulaciones (applications)').apunta(mias.ms, mias.error);

          // «Postulaciones de mis servicios»: en la app la pide el PROVEEDOR sobre las alertas que
          // publicó (`fetchApplicationsForProvider(serviceIds)`) y el conductor sobre las que tiene
          // asignadas. Aquí solo se miraba lo ASIGNADO y, como en esta prueba nadie queda asignado,
          // la línea salía «0 medidas» (22-09-2026): era un hueco del instrumento, no un cero de la app.
          const idsServicios = u.esProveedor
            ? serviciosDelProveedor
            : (asignados.dato || []).map((s) => s.id);
          if (idsServicios.length) {
            const recibidas = await pedir(
              `/rest/v1/applications?select=*&service_id=in.(${idsServicios.join(',')})`,
              { usuario: u }
            );
            tiemposLecturas.get('postulaciones de mis servicios (applications)').apunta(recibidas.ms, recibidas.error);
          }

          const sinLeer = await pedir('/rest/v1/rpc/servicios_sin_leer', {
            metodo: 'POST',
            usuario: u,
            cuerpo: {},
          });
          tiemposLecturas.get('contador de sin leer del chat (rpc)').apunta(sinLeer.ms, sinLeer.error);

          await new Promise((listo) => setTimeout(listo, 15000));
        }
      })
    );
    for (const t of tiemposLecturas.values()) t.informe();

    // ------------------------------------------------------------------ avisos
    titulo('5) Los avisos al teléfono que generó la prueba');
    const quedan = await pedir(
      `/rest/v1/avisos_cola?select=id&id=gt.${ESTADO.avisoIdInicial}`
    );
    linea(`   Al terminar las postulaciones había ${ESTADO.avisosEnCola} avisos en la cola.`);
    linea(
      `   Ahora quedan ${(quedan.dato || []).length} filas: el programa del VPS los manda cada 5 s y borra` +
        ' los que no puede entregar (estos usuarios de prueba no tienen teléfono), así que lo normal es 0.'
    );
  } catch (err) {
    linea(`\nLa prueba se cortó: ${err.message}`);
  } finally {
    // ------------------------------------------------------------------ limpieza
    titulo('6) Limpieza (se borra TODO lo de la prueba)');
    await limpiar(ESTADO);

    titulo('Cómo leer los números');
    linea('   - Mediana y p95 bajos (< 300 ms) con 0 fallos: ese ritmo lo aguanta con holgura.');
    linea('   - p95 por encima de 1 s o fallos: ese ritmo empieza a apretar. Mirar `docker stats`.');
    linea('   - La fase 4 es la que más pesa: cada app abierta pide 6 veces cada 15 s.');
    linea(`   - La corrida entera tardó ${segundos()} s: preparar y borrar las cuentas de prueba es lo`);
    linea('     que NO depende de la app; si ahí salen minutos por llamada, el problema es del alta');
  }
}

// Ctrl+C a media prueba: se avisa y se deja el proceso al `finally`, que limpia.
const ESTADO = { serviciosCreados: [], usuarios: [], grupoId: null, avisoIdInicial: -1, avisosEnCola: 0, limpiando: false };

process.on('SIGINT', async () => {
  if (ESTADO.limpiando) process.exit(1);
  ESTADO.limpiando = true;
  linea('\n\nParada a mano (Ctrl+C): limpiando lo creado…');
  try {
    await limpiar(ESTADO);
  } catch {
    linea('   (no se pudo limpiar del todo: vuelve a lanzar con --limpiar)');
  }
  process.exit(0);
});

principal();
