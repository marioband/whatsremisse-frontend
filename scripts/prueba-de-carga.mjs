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

/** Letra y barras para el informe. */
const linea = (t = '') => console.log(t);
const titulo = (t) => {
  linea('');
  linea(`== ${t} ==`);
};

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

/** Una llamada HTTP, midiendo lo que tarda y sin morir si falla. */
async function pedir(ruta, { metodo = 'GET', cuerpo, token, prefer } = {}) {
  const cabeceras = {
    apikey: CLAVE_PUBLICA || CLAVE_SERVICIO,
    Authorization: `Bearer ${token || CLAVE_SERVICIO || CLAVE_PUBLICA}`,
    'Content-Type': 'application/json',
  };
  if (prefer) cabeceras.Prefer = prefer;
  const inicio = Date.now();
  try {
    const respuesta = await fetch(`${URL_BASE}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const texto = await respuesta.text();
    const ms = Date.now() - inicio;
    if (!respuesta.ok) return { ms, error: `${respuesta.status} ${texto.slice(0, 120)}` };
    return { ms, dato: texto ? JSON.parse(texto) : null };
  } catch (err) {
    return { ms: Date.now() - inicio, error: String(err?.message || err) };
  }
}

/** Crea un usuario de prueba (el disparador de 0001 le crea el perfil solo). */
async function crearUsuario(indice) {
  const correo = `carga-${Date.now()}-${indice}@prueba.whatsremisse.tech`;
  const clave = `Carga${Date.now()}${indice}!`;
  const alta = await pedir('/auth/v1/admin/users', {
    metodo: 'POST',
    cuerpo: { email: correo, password: clave, email_confirm: true },
  });
  if (alta.error) throw new Error(`no se pudo crear el usuario de prueba: ${alta.error}`);
  return { id: alta.dato.id, correo, clave };
}

/** Entra como ese usuario y devuelve su token (el mismo camino que la app). */
async function entrar(usuario) {
  const entrada = await pedir('/auth/v1/token?grant_type=password', {
    metodo: 'POST',
    cuerpo: { email: usuario.correo, password: usuario.clave },
    token: CLAVE_PUBLICA,
  });
  if (entrada.error) throw new Error(`no se pudo entrar como ${usuario.correo}: ${entrada.error}`);
  return entrada.dato.access_token;
}

/** Espera a que llegue el momento (para clavar el ritmo pedido). */
const esperarHasta = (momento) =>
  new Promise((listo) => setTimeout(listo, Math.max(0, momento - Date.now())));

async function principal() {
  titulo('Prueba de carga de WhatsRemisse');
  linea(`   Proyecto: ${URL_BASE || '(sin dirección en el .env)'}`);
  linea(`   Ritmo de servicios:      20 por minuto durante ${MINUTOS} min (${20 * MINUTOS} servicios)`);
  linea(`   Ritmo de postulaciones:  30 por minuto durante ${MINUTOS} min (${30 * MINUTOS} postulaciones)`);
  linea(`   Apps abiertas simuladas: ${TELEFONOS} durante ${SEGUNDOS_LECTURA} s`);

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

  const serviciosCreados = [];
  const usuarios = [];
  let grupoId = null;
  const tiemposServicios = new Tiempos('Crear un servicio');
  const tiemposCompartir = new Tiempos('Compartirlo a un grupo');
  const tiemposPostulaciones = new Tiempos('Postularse (las 3 llamadas que hace la app)');
  const tiemposLecturas = new Map();
  let avisoIdInicial = 0;

  try {
    // ------------------------------------------------------------------ preparación
    titulo('1) Preparación (usuarios y grupo de prueba)');
    const cuantos = Math.max(2, TELEFONOS);
    for (let i = 0; i < cuantos; i += 1) usuarios.push(await crearUsuario(i));
    const proveedor = usuarios[0];
    await pedir(`/rest/v1/profiles?id=eq.${proveedor.id}`, {
      metodo: 'PATCH',
      cuerpo: { role: 'PROVIDER', full_name: 'Proveedor de prueba (carga)' },
    });
    usuarios[0].esProveedor = true;
    for (let i = 1; i < usuarios.length; i += 1) {
      await pedir(`/rest/v1/profiles?id=eq.${usuarios[i].id}`, {
        metodo: 'PATCH',
        cuerpo: { role: 'DRIVER', full_name: `Conductor de prueba ${i}` },
      });
    }
    linea(`   ${usuarios.length} usuarios de prueba creados (el primero es el proveedor).`);

    const creado = await pedir('/rest/v1/groups', {
      metodo: 'POST',
      cuerpo: { name: 'Grupo de prueba (carga)', owner_id: proveedor.id },
      prefer: 'return=representation',
    });
    grupoId = creado.dato?.[0]?.id;
    if (!grupoId) throw new Error(`no se pudo crear el grupo de prueba: ${creado.error}`);
    for (const u of usuarios) {
      await pedir('/rest/v1/group_members', {
        metodo: 'POST',
        cuerpo: { group_id: grupoId, user_id: u.id, role: u.esProveedor ? 'owner' : 'member' },
      });
    }
    const tokens = new Map();
    for (const u of usuarios) tokens.set(u.id, await entrar(u));
    const tokenProveedor = tokens.get(proveedor.id);
    linea(`   Grupo de prueba creado y ${usuarios.length} integrantes dentro.`);

    // Un aviso de referencia para saber cuáles son de la prueba.
    const antes = await pedir('/rest/v1/avisos_cola?select=id&order=id.desc&limit=1');
    avisoIdInicial = antes.dato?.[0]?.id ?? 0;

    // ------------------------------------------------------------------ fase 1: servicios
    titulo(`2) Creando servicios (20 por minuto durante ${MINUTOS} min)`);
    const cuantosServicios = 20 * MINUTOS;
    for (let i = 0; i < cuantosServicios; i += 1) {
      const momento = Date.now() + (i * 60000) / 20;
      await esperarHasta(momento);
      const servicio = await pedir('/rest/v1/service_alerts', {
        metodo: 'POST',
        token: tokenProveedor,
        prefer: 'return=representation',
        cuerpo: {
          provider_id: proveedor.id,
          group_id: grupoId,
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
      serviciosCreados.push(id);
      // La app también comparte el servicio al grupo (0018): es la segunda escritura real.
      const compartido = await pedir('/rest/v1/service_alert_groups', {
        metodo: 'POST',
        token: tokenProveedor,
        cuerpo: { service_id: id, group_id: grupoId, posicion: 1 },
      });
      tiemposCompartir.apunta(compartido.ms, compartido.error);
      process.stdout.write('.');
    }
    linea('');
    tiemposServicios.informe();
    tiemposCompartir.informe();

    // ------------------------------------------------------------------ fase 2: postulaciones
    titulo(`3) Postulándose (30 por minuto durante ${MINUTOS} min)`);
    const conductores = usuarios.filter((u) => !u.esProveedor);
    const cuantasPostulaciones = 30 * MINUTOS;
    for (let i = 0; i < cuantasPostulaciones; i += 1) {
      const momento = Date.now() + (i * 60000) / 30;
      await esperarHasta(momento);
      const servicio = serviciosCreados[i % serviciosCreados.length];
      const conductor = conductores[i % conductores.length];
      if (!servicio || !conductor) break;
      // La app, antes de postular, MIRA el estado real (2 lecturas) y después hace el upsert:
      // 3 llamadas por postulación. Se miden las tres juntas, que es lo que cuesta de verdad.
      const token = tokens.get(conductor.id);
      const arranque = Date.now();
      const estado = await pedir(
        `/rest/v1/service_alerts?select=status,assigned_driver_id&id=eq.${servicio}`,
        { token }
      );
      const mia = await pedir(
        `/rest/v1/applications?select=*&service_id=eq.${servicio}&driver_id=eq.${conductor.id}`,
        { token }
      );
      const yaAceptado = mia.dato?.[0]?.status === 'APPROVED' && estado.dato?.[0]?.assigned_driver_id === conductor.id;
      let error = estado.error || mia.error;
      if (!error && !estado.dato?.[0]?.assigned_driver_id && !yaAceptado) {
        const postulacion = await pedir('/rest/v1/applications?on_conflict=service_id,driver_id', {
          metodo: 'POST',
          token,
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
    const telefonos = usuarios.slice(0, TELEFONOS);
    await Promise.all(
      telefonos.map(async (u) => {
        const token = tokens.get(u.id);
        while (Date.now() < finLectura) {
          const grupos = await pedir(
            `/rest/v1/group_members?select=group_id,role,favorite,muted,groups(id,name,owner_id,avatar_url)&user_id=eq.${u.id}`,
            { token }
          );
          tiemposLecturas.get('mis grupos (group_members)').apunta(grupos.ms, grupos.error);
          const idsGrupos = (grupos.dato || []).map((f) => f.group_id);

          const asignados = await pedir(
            `/rest/v1/service_alerts?select=*&assigned_driver_id=eq.${u.id}`,
            { token }
          );
          tiemposLecturas.get('servicios asignados (service_alerts)').apunta(asignados.ms, asignados.error);

          if (idsGrupos.length) {
            const delGrupo = await pedir(
              `/rest/v1/service_alerts?select=*&group_id=in.(${idsGrupos.join(',')})`,
              { token }
            );
            tiemposLecturas.get('alertas de mis grupos (service_alerts)').apunta(delGrupo.ms, delGrupo.error);
          }

          const mias = await pedir(`/rest/v1/applications?select=*&driver_id=eq.${u.id}`, { token });
          tiemposLecturas.get('mis postulaciones (applications)').apunta(mias.ms, mias.error);

          const idsServicios = (asignados.dato || []).map((s) => s.id);
          if (idsServicios.length) {
            const recibidas = await pedir(
              `/rest/v1/applications?select=*&service_id=in.(${idsServicios.join(',')})`,
              { token }
            );
            tiemposLecturas.get('postulaciones de mis servicios (applications)').apunta(recibidas.ms, recibidas.error);
          }

          const sinLeer = await pedir('/rest/v1/rpc/servicios_sin_leer', { metodo: 'POST', token, cuerpo: {} });
          tiemposLecturas.get('contador de sin leer del chat (rpc)').apunta(sinLeer.ms, sinLeer.error);

          await new Promise((listo) => setTimeout(listo, 15000));
        }
      })
    );
    for (const t of tiemposLecturas.values()) t.informe();

    // ------------------------------------------------------------------ avisos
    titulo('5) Los avisos al teléfono que generó la prueba');
    const despues = await pedir(
      `/rest/v1/avisos_cola?select=id,enviado_at&id=gt.${avisoIdInicial}`
    );
    const pendientes = (despues.dato || []).filter((a) => !a.enviado_at).length;
    linea(`   ${(despues.dato || []).length} avisos apuntados en la cola · ${pendientes} sin enviar todavía`);
    linea('   (el programa del VPS los manda cada 5 segundos; si quedan muchos sin enviar, la cola va con retraso)');
  } catch (err) {
    linea(`\nLa prueba se cortó: ${err.message}`);
  } finally {
    // ------------------------------------------------------------------ limpieza
    titulo('6) Limpieza (se borra TODO lo de la prueba)');
    for (const id of serviciosCreados) {
      await pedir(`/rest/v1/service_alerts?id=eq.${id}`, { metodo: 'DELETE' });
    }
    linea(`   ${serviciosCreados.length} servicios de prueba borrados (con sus postulaciones).`);
    if (avisoIdInicial >= 0) {
      const idsUsuarios = usuarios.map((u) => u.id);
      if (idsUsuarios.length) {
        await pedir(
          `/rest/v1/avisos_cola?id=gt.${avisoIdInicial}&destinatarios=cs.{${idsUsuarios.join(',')}}`,
          { metodo: 'DELETE' }
        );
        linea('   avisos de la prueba borrados.');
      }
    }
    if (grupoId) {
      await pedir(`/rest/v1/groups?id=eq.${grupoId}`, { metodo: 'DELETE' });
      linea('   grupo de prueba borrado.');
    }
    for (const u of usuarios) {
      await pedir(`/auth/v1/admin/users/${u.id}`, { metodo: 'DELETE' });
    }
    linea(`   ${usuarios.length} usuarios de prueba borrados.`);

    titulo('Cómo leer los números');
    linea('   - Mediana y p95 bajos (< 300 ms) con 0 fallos: ese ritmo lo aguanta con holgura.');
    linea('   - p95 por encima de 1 s o fallos: ese ritmo empieza a apretar. Mirar `docker stats`.');
    linea('   - La fase 4 es la que más pesa: cada app abierta pide 6 veces cada 15 s.');
  }
}

principal();
