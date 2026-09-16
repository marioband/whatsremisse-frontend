/**
 * Nombre del proveedor que se pinta en las tarjetas de servicio (lógica pura).
 *
 * Regla del usuario: va el **nombre de proveedor que el usuario configuró** en su
 * perfil (→ `profiles.vehicle_data.provider_name`) y, si no lo configuró, su **primer
 * nombre y su primer apellido**. Nunca "Empresa".
 *
 * Por qué hacía falta: `service_alerts` no tiene columnas de nombre (el mapper de la
 * base descarta `company_name`/`provider_name`), así que las tarjetas siempre caían en
 * el respaldo "Empresa". La lectura del perfil de otro usuario vive en
 * `lib/proveedorDeLaTarjeta.ts` (con la caché y la llamada a `public_profile`).
 */

import { FilaPerfilConVehicleData, FilaPerfilPublico, partirNombre } from './perfilPublico';
import { ServiceAlert } from '../types';

/** Último respaldo: nada de "Empresa" (el usuario no lo quiere ver). */
export const PROVEEDOR_SIN_NOMBRE = 'Proveedor';

/** "Mario André Baldeón Andía" → "Mario Baldeón" (primer nombre + primer apellido). */
export function primerNombreYApellido(fullName?: string | null): string {
  const { nombres, apellidos } = partirNombre(fullName);
  const primerNombre = nombres.split(/\s+/).filter(Boolean)[0] ?? '';
  const primerApellido = apellidos.split(/\s+/).filter(Boolean)[0] ?? '';
  return [primerNombre, primerApellido].filter(Boolean).join(' ');
}

/**
 * Nombre según el perfil del proveedor: el configurado o, si falta, primer nombre y
 * primer apellido. Cadena vacía si el perfil no tiene ni una cosa ni la otra.
 */
export function nombreDelProveedorDesdeElPerfil(
  fila?: FilaPerfilPublico | FilaPerfilConVehicleData | null
): string {
  const vehiculo = (fila?.vehicle_data || {}) as Record<string, unknown>;
  const configurado =
    typeof vehiculo.provider_name === 'string' ? vehiculo.provider_name.trim() : '';
  if (configurado) return configurado;
  return primerNombreYApellido(fila?.full_name);
}

/** El nombre que ya trae la propia fila del servicio (los borradores en memoria). */
export function nombreDeLaFila(service?: Partial<ServiceAlert> | null): string {
  return (service?.company_name || service?.provider_name || '').trim();
}

/**
 * Nombre a pintar: la fila del servicio (si lo trae) → el nombre ya resuelto del
 * proveedor → el genérico "Proveedor".
 */
export function nombreParaMostrar(
  service?: Partial<ServiceAlert> | null,
  nombreResuelto?: string | null
): string {
  return nombreDeLaFila(service) || (nombreResuelto || '').trim() || PROVEEDOR_SIN_NOMBRE;
}
