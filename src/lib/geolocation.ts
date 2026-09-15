/**
 * Ubicación del dispositivo.
 *
 * Se usa la geolocalización del navegador (`navigator.geolocation`), que es la
 * que está disponible en la versión web de la app sin añadir dependencias
 * (expo-location implicaría instalarlo y reconstruir; queda pendiente para la
 * app nativa, donde `navigator.geolocation` no existe).
 *
 * Un detalle importante que costó un rato descubrir: el navegador **solo**
 * entrega la ubicación en orígenes seguros (HTTPS o localhost). Servida por HTTP
 * sobre una IP (por ejemplo el servidor de desarrollo `http://…:19006`) responde
 * `"Only secure origins are allowed"` y no hay forma de obtener la posición. Por
 * eso aquí se distingue el motivo del fallo: la pantalla puede explicarlo en
 * lugar de mostrar un hueco vacío.
 *
 * Nunca se pide permiso al abrir la pantalla: se llama solo cuando el usuario
 * tiene premium y hace falta medir la distancia al origen.
 */

export interface Ubicacion {
  lat: number;
  lng: number;
  /** Precisión en metros, si el navegador la informa. */
  precision?: number;
}

/** Por qué no se pudo obtener la ubicación. */
export type MotivoUbicacion =
  'contexto-inseguro' | 'sin-soporte' | 'permiso-denegado' | 'sin-respuesta';

let ultima: Ubicacion | null = null;
let ultimoMotivo: MotivoUbicacion | null = null;

/** Última posición conocida (para no repetir el permiso en cada servicio). */
export function ultimaUbicacion(): Ubicacion | null {
  return ultima;
}

/** Motivo del último fallo, o null si la última lectura salió bien. */
export function motivoDeUbicacion(): MotivoUbicacion | null {
  return ultimoMotivo;
}

/** ¿El navegador permite pedir la ubicación en este origen? */
export function hayContextoSeguro(): boolean {
  if (typeof window === 'undefined') return true; // nativo: lo gestiona el sistema
  const seguro = (window as { isSecureContext?: boolean }).isSecureContext;
  return seguro !== false;
}

export function hayGeolocalizacion(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

/** Olvida la posición y el motivo: se usa al reintentar (botón "Reintentar"). */
export function olvidarUbicacion(): void {
  ultima = null;
  ultimoMotivo = null;
}

/**
 * Texto para mostrar al usuario cuando no hay ubicación (o null si la hay).
 * Se redacta en segunda persona y sin tecnicismos innecesarios.
 */
export function explicacionDeUbicacion(): string | null {
  switch (ultimoMotivo) {
    case 'contexto-inseguro':
      return 'La app debe abrirse por HTTPS para poder usar tu ubicación: el navegador la bloquea en conexiones no seguras.';
    case 'permiso-denegado':
      return 'Permite el acceso a tu ubicación para ver a qué distancia estás del origen.';
    case 'sin-respuesta':
      return 'No se pudo obtener tu ubicación. Inténtalo de nuevo.';
    case 'sin-soporte':
      return 'Este dispositivo no permite obtener la ubicación.';
    default:
      return null;
  }
}

/** Pide la posición actual. Devuelve null si no hay permiso o no hay soporte. */
export function obtenerUbicacion(timeoutMs = 10000): Promise<Ubicacion | null> {
  // Se comprueba ANTES de llamar: en un origen no seguro el navegador rechaza
  // siempre, y así el motivo es el real y no un "permiso denegado" engañoso.
  if (!hayContextoSeguro()) {
    ultimoMotivo = 'contexto-inseguro';
    return Promise.resolve(ultima);
  }
  if (!hayGeolocalizacion()) {
    ultimoMotivo = 'sin-soporte';
    return Promise.resolve(ultima);
  }

  return new Promise((resolve) => {
    let resuelto = false;
    const terminar = (valor: Ubicacion | null, motivo: MotivoUbicacion | null = null) => {
      if (resuelto) return;
      resuelto = true;
      if (valor) {
        ultima = valor;
        ultimoMotivo = null;
      } else {
        ultimoMotivo = motivo ?? ultimoMotivo;
      }
      resolve(valor);
    };

    const temporizador = setTimeout(() => terminar(ultima, 'sin-respuesta'), timeoutMs);

    try {
      navigator.geolocation.getCurrentPosition(
        (posicion) =>
          terminar({
            lat: posicion.coords.latitude,
            lng: posicion.coords.longitude,
            precision: posicion.coords.accuracy,
          }),
        (error) => {
          clearTimeout(temporizador);
          // 1 = permiso denegado (o bloqueado), 3 = sin respuesta a tiempo.
          const motivo: MotivoUbicacion = error?.code === 1 ? 'permiso-denegado' : 'sin-respuesta';
          // eslint-disable-next-line no-console
          console.warn('[geolocation] no se pudo obtener la posición:', error?.message);
          terminar(ultima, motivo);
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
      );
    } catch (err) {
      clearTimeout(temporizador);
      // eslint-disable-next-line no-console
      console.warn('[geolocation] error inesperado:', err);
      terminar(ultima, 'sin-respuesta');
    }
  });
}
