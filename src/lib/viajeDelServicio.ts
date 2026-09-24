/**
 * El viaje (origen → destino) medido UNA vez y guardado en el servicio (0043).
 *
 * Acuerdo con el usuario (23-09-2026, recordado por él el 24-09): «el tramo origen → destino es
 * fijo para un servicio». Se guardaba 30 días… pero en la caché de CADA TELÉFONO, así que la misma
 * pregunta se le pagaba a Google una vez por cada conductor que veía la tarjeta (y otra más cuando
 * entraba uno nuevo). Ahora la mide el proveedor al publicar y queda escrita EN EL SERVICIO: los
 * demás teléfonos la LEEN. El gasto deja de depender de cuántos conductores haya.
 *
 * Nunca puede impedir publicar: si la medida falla (sin red, sin clave de Google, sin coordenadas),
 * el servicio se guarda igual y cada teléfono medirá el viaje por su cuenta, como hasta ahora.
 */
import { ServiceAlert } from '../types';
import { formatearEstimacion, medirRuta } from './routes';

/** ¿Tiene datos utilizables algún extremo? (dirección escrita o coordenadas) */
function sirve(punto: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): boolean {
  const tieneDireccion = Boolean((punto.address || '').trim());
  const tieneCoordenadas = typeof punto.lat === 'number' && typeof punto.lng === 'number';
  return tieneDireccion || tieneCoordenadas;
}

/**
 * ¿Hay que medir el viaje de este servicio?
 *  - Publicación nueva: solo si no trae ya un viaje medido.
 *  - Edición: si cambiaron las direcciones, o si nunca se midió.
 * (Con las mismas direcciones, el viaje guardado sigue valiendo: no se vuelve a pagar.)
 */
export function haceFaltaMedirElViaje(
  servicio: Partial<ServiceAlert>,
  anteriores?: Partial<ServiceAlert> | null
): boolean {
  if (
    !sirve({ address: servicio.origin_address, lat: servicio.origin_lat, lng: servicio.origin_lng })
  ) {
    return false;
  }
  if (
    !sirve({
      address: servicio.destination_address,
      lat: servicio.destination_lat,
      lng: servicio.destination_lng,
    })
  ) {
    return false;
  }
  if (!anteriores) return !servicio.destination_estimate;
  const cambiaron =
    anteriores.origin_address !== servicio.origin_address ||
    anteriores.destination_address !== servicio.destination_address;
  if (cambiaron) return true;
  return !servicio.destination_estimate;
}

/** Mide el viaje y devuelve lo que hay que guardar en el servicio (null si no se pudo medir). */
export async function medirElViaje(
  servicio: Partial<ServiceAlert>
): Promise<Partial<ServiceAlert> | null> {
  const medida = await medirRuta(
    {
      address: servicio.origin_address || '',
      lat: servicio.origin_lat ?? null,
      lng: servicio.origin_lng ?? null,
    },
    {
      address: servicio.destination_address || '',
      lat: servicio.destination_lat ?? null,
      lng: servicio.destination_lng ?? null,
    }
  );
  if (!medida) return null;
  return {
    // La tarjeta del conductor lee `destination_estimate`: es el texto del viaje («25 min 12.3 km»).
    destination_estimate: formatearEstimacion(medida) || undefined,
    viajeMetros: medida.metros,
    viajeSegundos: medida.segundos,
    viajeMedidoAt: new Date().toISOString(),
  };
}
