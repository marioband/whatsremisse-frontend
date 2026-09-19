/**
 * El borrador del formulario de "Nuevo servicio".
 *
 * Lo pidió el usuario el 18-09-2026: "si el proveedor está llenando datos en nuevo servicio
 * y sin seleccionar alguno de los 3 botones de acción selecciona el botón atrás, al volver
 * a crear servicio, esos datos previos deben mantenerse".
 *
 * Entonces: lo que se escribe en el formulario se va guardando aquí (el dispositivo, con
 * `lib/cache.ts`), y al volver a abrir "Nuevo servicio" el formulario arranca con eso. Los
 * tres botones del pie hacen lo suyo: **Guardar** y **Anular → Descartar** borran el
 * borrador, **Elegir grupos** lo deja (si el usuario vuelve desde esa pantalla, sigue
 * editando donde estaba).
 *
 * Solo aplica a un servicio NUEVO: al editar uno existente manda lo que ya está guardado en
 * la tarjeta, nunca un borrador viejo.
 */

import { borrarDeCache, guardarCache, leerCache } from './cache';
import { normalizarUnidades } from './unidades';

export interface PuntoDelBorrador {
  lat: number;
  lng: number;
}

export interface BorradorDeServicio {
  origin: string;
  destinations: string[];
  coordsOrigen: PuntoDelBorrador | null;
  /** Un punto por cada parada, indexado por su posición (igual que el estado de la pantalla). */
  coordsDestinos: Record<number, PuntoDelBorrador | null>;
  fare: string;
  paymentType: string;
  otherPayment: string;
  paymentDate: string;
  customPaymentDate: string;
  /**
   * Las unidades marcadas (19-09-2026: el proveedor marca VARIAS). Un borrador viejo traía
   * `unitType` con un solo texto y se sigue leyendo (`leerBorradorDeServicio`).
   */
  unidades: string[];
  observation: string;
  /** Las fechas van en ISO: un `Date` no se puede guardar tal cual. */
  fechaServicio: string;
  horaServicio: string;
  alMomento: boolean;
}

/** Clave del borrador en el almacén del dispositivo. */
export const CLAVE_BORRADOR = 'servicio:borrador';

/** Sin vencimiento propio: el borrador vive hasta que se publica o se descarta. */
const SIN_TTL = -1;

/**
 * ¿El borrador tiene algo que merezca conservarse?
 *
 * Un formulario recién abierto no debe dejar borrador (ni, al volver, "restaurar" un
 * formulario vacío). Se considera que hay datos en cuanto el usuario escribió algo.
 */
export function borradorTieneDatos(borrador: BorradorDeServicio | null | undefined): boolean {
  if (!borrador) return false;
  return (
    borrador.origin.trim().length > 0 ||
    borrador.destinations.some((d) => d.trim().length > 0) ||
    borrador.fare.trim().length > 0 ||
    borrador.observation.trim().length > 0 ||
    borrador.otherPayment.trim().length > 0 ||
    borrador.customPaymentDate.trim().length > 0
  );
}

/** Lo guardado en el dispositivo (null si no hay nada o no tiene datos). */
export async function leerBorradorDeServicio(): Promise<BorradorDeServicio | null> {
  const guardado = await leerCache<BorradorDeServicio & { unitType?: unknown }>(
    CLAVE_BORRADOR,
    SIN_TTL
  );
  if (!guardado || !Array.isArray(guardado.destinations)) return null;
  // Un borrador guardado antes del 19-09-2026 traía UN solo tipo en `unitType`: se lee
  // igual, así el proveedor que estaba a medias no pierde lo que había marcado.
  const normalizado: BorradorDeServicio = {
    ...guardado,
    unidades: normalizarUnidades(guardado.unidades ?? guardado.unitType),
  };
  return borradorTieneDatos(normalizado) ? normalizado : null;
}

export async function guardarBorradorDeServicio(borrador: BorradorDeServicio): Promise<void> {
  // OJO: el tercer argumento de `guardarCache` es CUÁNDO se escribió, no el vencimiento
  // (el vencimiento se decide al leer, con `SIN_TTL` en `leerBorradorDeServicio`).
  await guardarCache(CLAVE_BORRADOR, borrador);
}

/** Se llama al publicar/guardar el servicio y al descartarlo desde "Anular". */
export async function limpiarBorradorDeServicio(): Promise<void> {
  await borrarDeCache(CLAVE_BORRADOR);
}
