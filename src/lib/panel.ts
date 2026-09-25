/**
 * Panel de administración: las reglas puras (sin React, sin base de datos y sin red).
 *
 * Aquí vive todo lo que se puede probar sin arrancar la app: cómo se llama cada estado de
 * membresía, qué color lleva, cómo se muestran los números y los teléfonos, y qué texto sale
 * cuando la base contesta que no se puede (por ejemplo si falta aplicar la migración 0046).
 *
 * Las llamadas a la base están en `lib/database.ts` (`panelResumen`, `panelUsuarios`, …) porque
 * este archivo también lo ejecuta el banco de pruebas en Node, donde `lib/supabase.ts` no puede
 * importarse (lanza «faltan credenciales»).
 */

export type EstadoMembresia =
  | 'ACTIVA'
  | 'SIN_VENCIMIENTO'
  | 'POR_VENCER'
  | 'VENCIDA'
  | 'SIN_MEMBRESIA';

export type FiltroMembresia = 'TODAS' | 'POR_VENCER' | 'VENCIDAS' | 'SIN_MEMBRESIA' | 'ACTIVAS';

/** Los filtros del listado, en el orden en que se pintan (primero lo que hay que atender). */
export const FILTROS: readonly { id: FiltroMembresia; etiqueta: string }[] = [
  { id: 'TODAS', etiqueta: 'Todas' },
  { id: 'POR_VENCER', etiqueta: 'Por vencer' },
  { id: 'VENCIDAS', etiqueta: 'Vencidas' },
  { id: 'SIN_MEMBRESIA', etiqueta: 'Sin membresía' },
  { id: 'ACTIVAS', etiqueta: 'Activas' },
];

/** Los planes que el administrador puede activar (los mismos que ofrece la pantalla de Membresía). */
export const PLANES: readonly { dias: number; etiqueta: string }[] = [
  { dias: 30, etiqueta: '1 mes' },
  { dias: 60, etiqueta: '2 meses' },
  { dias: 90, etiqueta: '3 meses' },
];

/** Los roles de `profiles.role`, con su nombre en español. */
export const ROLES: readonly { id: string; etiqueta: string }[] = [
  { id: 'DRIVER', etiqueta: 'Conductor' },
  { id: 'PROVIDER', etiqueta: 'Proveedor' },
  { id: 'GROUP_OWNER', etiqueta: 'Dueño de grupo' },
  { id: 'ADMIN', etiqueta: 'Administrador' },
];

export interface UsuarioDelPanel {
  id: string;
  phone: string | null;
  full_name: string | null;
  role: string | null;
  tier: string | null;
  subscription_expires_at: string | null;
  created_at: string | null;
  last_seen_at: string | null;
  servicios: number | null;
  postulaciones: number | null;
  estado: EstadoMembresia | string;
  dias_restantes: number | null;
}

export interface ResumenDelPanel {
  modo_pruebas: boolean;
  calculado_at?: string;
  cuentas: {
    total: number;
    proveedores: number;
    conductores: number;
    administradores: number;
    hoy: number;
    ultimos_7: number;
    ultimos_30: number;
  };
  actividad: { vistos_24h: number; vistos_7d: number; con_ubicacion: number };
  membresias: {
    activas: number;
    sin_vencimiento: number;
    por_vencer_7: number;
    vencidas: number;
    sin_membresia: number;
  };
  servicios: {
    total: number;
    ultimos_30: number;
    abiertos: number;
    en_curso: number;
    concluidos: number;
    cancelados: number;
    sin_postulantes_30: number;
  };
  postulaciones: { total: number; ultimos_30: number; pendientes: number };
}

export interface AccionDelPanel {
  id: number;
  creado_at: string;
  admin_phone: string | null;
  accion: string;
  usuario_phone: string | null;
  detalle: Record<string, unknown> | null;
}

/** El estado que le toca a un usuario, calculado en el teléfono (respaldo del que manda el servidor). */
export function estadoDeUsuario(usuario: {
  tier?: string | null;
  subscription_expires_at?: string | null;
  estado?: string | null;
}): EstadoMembresia {
  const delServidor = String(usuario.estado || '').toUpperCase();
  if (delServidor === 'ACTIVA' || delServidor === 'SIN_VENCIMIENTO' || delServidor === 'POR_VENCER'
    || delServidor === 'VENCIDA' || delServidor === 'SIN_MEMBRESIA') {
    return delServidor as EstadoMembresia;
  }

  if (String(usuario.tier || '').toUpperCase() !== 'PREMIUM') return 'SIN_MEMBRESIA';
  const vence = usuario.subscription_expires_at ? new Date(usuario.subscription_expires_at) : null;
  if (!vence || Number.isNaN(vence.getTime())) return 'SIN_VENCIMIENTO';
  const faltan = vence.getTime() - Date.now();
  if (faltan <= 0) return 'VENCIDA';
  if (faltan <= 7 * 24 * 60 * 60 * 1000) return 'POR_VENCER';
  return 'ACTIVA';
}

/** Rótulo corto del estado (el que va en la etiqueta de la fila). */
export function textoDeEstado(estado: EstadoMembresia | string): string {
  switch (String(estado).toUpperCase()) {
    case 'ACTIVA':
      return 'Activa';
    case 'SIN_VENCIMIENTO':
      return 'Sin vencimiento';
    case 'POR_VENCER':
      return 'Por vencer';
    case 'VENCIDA':
      return 'Vencida';
    default:
      return 'Sin membresía';
  }
}

/** Color de la etiqueta del estado. Verde = al día; ámbar = hay que avisar; rojo = perdida. */
export function colorDeEstado(estado: EstadoMembresia | string): string {
  switch (String(estado).toUpperCase()) {
    case 'ACTIVA':
    case 'SIN_VENCIMIENTO':
      return '#2E9E5B';
    case 'POR_VENCER':
      return '#B8860B';
    case 'VENCIDA':
      return '#C2333F';
    default:
      return '#888888';
  }
}

/** Frase de la membresía, con los días que le quedan. */
export function etiquetaDeMembresia(usuario: {
  estado?: string | null;
  dias_restantes?: number | null;
  tier?: string | null;
  subscription_expires_at?: string | null;
}): string {
  const estado = estadoDeUsuario(usuario);
  const dias = usuario.dias_restantes;

  switch (estado) {
    case 'SIN_VENCIMIENTO':
      return 'Premium sin vencimiento';
    case 'ACTIVA':
      return dias === null || dias === undefined ? 'Premium activo' : `Premium: ${dias} día(s)`;
    case 'POR_VENCER':
      return dias === null || dias === undefined || dias <= 0
        ? 'Vence hoy'
        : `Vence en ${dias} día(s)`;
    case 'VENCIDA':
      return dias === null || dias === undefined || dias >= 0
        ? 'Premium vencido'
        : `Vencida hace ${Math.abs(dias)} día(s)`;
    default:
      return 'Cuenta gratuita';
  }
}

/** Nombre del usuario o, si no lo tiene, deja claro que es una cuenta sin nombre. */
export function nombreDeUsuario(usuario: { full_name?: string | null; phone?: string | null }): string {
  const nombre = (usuario.full_name || '').trim();
  if (nombre) return nombre;
  const telefono = telefonoBonito(usuario.phone);
  return telefono ? `Cuenta ${telefono}` : 'Cuenta sin nombre';
}

/** El teléfono con espacios cada tres dígitos, para leerlo de un vistazo. */
export function telefonoBonito(phone?: string | null): string {
  const digitos = String(phone || '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.length !== 9) return digitos;
  return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`;
}

/** Fecha corta (día/mes/año) de una fecha ISO; cadena vacía si no sirve. */
export function fechaCorta(iso?: string | null): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`;
}

/**
 * Los números grandes con separador de miles (1.234).
 *
 * Se hace a mano y NO con `toLocaleString('es-PE')`: el dato de locale no está en todos los
 * entornos (en Node, `(1234).toLocaleString('es-PE')` sale «1,234» y en `es-ES` sale «1234»), así
 * que el mismo número se vería distinto en el teléfono, en el navegador y en las pruebas. Es la
 * misma trampa que ya se documentó con los meses («setiembre» vs «Septiembre»).
 */
export function numeroConMiles(valor: number | null | undefined): string {
  const n = typeof valor === 'number' && Number.isFinite(valor) ? Math.trunc(valor) : 0;
  const signo = n < 0 ? '-' : '';
  const digitos = String(Math.abs(n));
  return signo + digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** El nombre del rol en español. */
export function nombreDeRol(rol?: string | null): string {
  const buscado = String(rol || '').toUpperCase();
  return ROLES.find((r) => r.id === buscado)?.etiqueta || 'Sin rol';
}

/**
 * Los números del panel, en filas para pintar. `destacado` marca lo que pide acción hoy
 * (por vencer y servicios que nadie tomó).
 */
export function resumenEnFilas(resumen: ResumenDelPanel): {
  etiqueta: string;
  valor: string;
  nota: string;
  destacado: boolean;
}[] {
  const c = resumen.cuentas;
  const a = resumen.actividad;
  const m = resumen.membresias;
  const s = resumen.servicios;
  const p = resumen.postulaciones;

  return [
    {
      etiqueta: 'Cuentas',
      valor: numeroConMiles(c.total),
      nota: `${numeroConMiles(c.proveedores)} proveedor(es) · ${numeroConMiles(c.conductores)} conductor(es)`,
      destacado: false,
    },
    {
      etiqueta: 'Entraron hoy',
      valor: numeroConMiles(c.hoy),
      nota: `${numeroConMiles(c.ultimos_7)} en 7 días · ${numeroConMiles(c.ultimos_30)} en 30 días`,
      destacado: false,
    },
    {
      etiqueta: 'Se movieron (24 h)',
      valor: numeroConMiles(a.vistos_24h),
      nota: `${numeroConMiles(a.vistos_7d)} en 7 días`,
      destacado: false,
    },
    {
      etiqueta: 'Membresías activas',
      valor: numeroConMiles(m.activas),
      nota: `${numeroConMiles(m.sin_vencimiento)} sin vencimiento`,
      destacado: false,
    },
    {
      etiqueta: 'Por vencer (7 días)',
      valor: numeroConMiles(m.por_vencer_7),
      nota: m.por_vencer_7 > 0 ? 'Avísales o renuévales' : 'Nadie por vencer',
      destacado: m.por_vencer_7 > 0,
    },
    {
      etiqueta: 'Vencidas',
      valor: numeroConMiles(m.vencidas),
      nota: m.vencidas > 0 ? 'Ya no tienen las funciones de pago' : 'Ninguna vencida',
      destacado: m.vencidas > 0,
    },
    {
      etiqueta: 'Sin membresía',
      valor: numeroConMiles(m.sin_membresia),
      nota: 'Cuentas gratuitas',
      destacado: false,
    },
    {
      etiqueta: 'Servicios publicados',
      valor: numeroConMiles(s.total),
      nota: `${numeroConMiles(s.ultimos_30)} en los últimos 30 días`,
      destacado: false,
    },
    {
      etiqueta: 'Abiertos sin conductor',
      valor: numeroConMiles(s.abiertos),
      nota: `${numeroConMiles(s.en_curso)} en curso`,
      destacado: false,
    },
    {
      etiqueta: 'Sin un solo postulante (30 d)',
      valor: numeroConMiles(s.sin_postulantes_30),
      nota: s.sin_postulantes_30 > 0 ? 'Faltan conductores o se publicó mal' : 'Todos recibieron postulantes',
      destacado: s.sin_postulantes_30 > 0,
    },
    {
      etiqueta: 'Servicios concluidos',
      valor: numeroConMiles(s.concluidos),
      nota: `${numeroConMiles(s.cancelados)} cancelado(s)`,
      destacado: false,
    },
    {
      etiqueta: 'Postulaciones',
      valor: numeroConMiles(p.total),
      nota: `${numeroConMiles(p.pendientes)} esperando respuesta`,
      destacado: false,
    },
  ];
}

/** El texto de una acción del registro, en pasado y sin tecnicismos. */
export function textoDeAccion(accion?: string | null): string {
  switch (String(accion || '').toUpperCase()) {
    case 'MEMBRESIA_ACTIVADA':
      return 'Activó una membresía';
    case 'MEMBRESIA_QUITADA':
      return 'Quitó la membresía';
    case 'ROL_CAMBIADO':
      return 'Cambió el rol';
    case 'MODO_PRUEBAS':
      return 'Cambió el modo de pruebas';
    default:
      return 'Acción';
  }
}

/** El detalle de una acción, en una línea legible. */
export function detalleDeAccion(accion?: string | null, detalle?: Record<string, unknown> | null): string {
  const d = detalle || {};
  const texto = (clave: string) => {
    const valor = d[clave];
    return valor === null || valor === undefined || valor === '' ? null : String(valor);
  };

  switch (String(accion || '').toUpperCase()) {
    case 'MEMBRESIA_ACTIVADA': {
      const partes: string[] = [];
      const sinVencimiento = d.sin_vencimiento === true;
      if (sinVencimiento) partes.push('sin vencimiento');
      else partes.push(`${texto('dias') || '—'} día(s)`);
      const antes = texto('antes_tier');
      if (antes) partes.push(`antes: ${antes === 'PREMIUM' ? 'premium' : 'gratuita'}`);
      return partes.join(' · ');
    }
    case 'MEMBRESIA_QUITADA': {
      const antes = texto('antes_tier');
      return antes === 'PREMIUM' ? 'era premium' : '';
    }
    case 'ROL_CAMBIADO': {
      const antes = nombreDeRol(texto('antes'));
      const ahora = nombreDeRol(texto('ahora'));
      return `${antes} → ${ahora}`;
    }
    case 'MODO_PRUEBAS': {
      const ahora = d.ahora === true;
      return ahora ? 'quedó en modo pruebas (todos premium)' : 'quedó en modo real (manda la base)';
    }
    default:
      return '';
  }
}

/** El aviso del interruptor, para que nadie lo cambie sin saber qué pasa. */
export function avisoDeModoPruebas(encendido: boolean): string {
  return encendido
    ? 'Modo pruebas: TODAS las cuentas tienen las funciones de pago, aunque su membresía esté vencida o no la tengan. Es como estaba la app hasta ahora.'
    : 'Modo real: las funciones de pago solo las tiene la cuenta con membresía activa. Quien no esté activado por ti las pierde.';
}

/** Qué decirle al usuario cuando el panel no carga. */
export function problemaDelPanel(error: unknown): string {
  const texto = String((error as { message?: string } | null)?.message || error || '');
  const minusculas = texto.toLowerCase();

  if (minusculas.includes('solo para administradores') || minusculas.includes('42501')) {
    return 'Esta sección es solo para administradores.';
  }
  if (minusculas.includes('iniciar sesion') || minusculas.includes('iniciar sesión')) {
    return 'Vuelve a entrar a la app para abrir el panel.';
  }
  if (
    minusculas.includes('does not exist')
    || minusculas.includes('could not find the function')
    || minusculas.includes('schema cache')
    || minusculas.includes('pgrst202')
  ) {
    return 'Falta aplicar la migración 0046_panel_de_administracion.sql en la base. Hasta entonces el panel no puede leer ni cambiar nada.';
  }
  return `No se pudo abrir el panel: ${texto || 'sin detalle'}`;
}

/** La confirmación antes de dejar a alguien sin membresía (acción que se nota). */
export function confirmacionDeQuitar(nombre: string): string {
  return `¿Quitarle la membresía a ${nombre}? La cuenta sigue existiendo, pero pierde las direcciones y los tiempos hasta que la vuelvas a activar.`;
}

/** La confirmación antes de dar o quitar el rol de administrador. */
export function confirmacionDeRol(nombre: string, rol: string): string {
  return `¿Cambiar el rol de ${nombre} a ${nombreDeRol(rol)}? Un administrador puede abrir el panel y cambiar membresías.`;
}

/** El estado de la membresía ya resumido para la ficha de un usuario. */
export function resumenDeUsuario(usuario: UsuarioDelPanel): string {
  const partes = [nombreDeRol(usuario.role), etiquetaDeMembresia(usuario)];
  const desde = fechaCorta(usuario.created_at);
  if (desde) partes.push(`cuenta desde ${desde}`);
  return partes.join(' · ');
}
