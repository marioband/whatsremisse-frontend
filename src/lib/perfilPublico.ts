/**
 * Datos públicos de otra persona (por ejemplo un postulante), ya ordenados para
 * pintarlos en pantalla.
 *
 * Todo sale de la función `public_profile` (0005), que devuelve `full_name` y el
 * JSONB `vehicle_data`. Ese JSONB lo escribe el propio usuario al completar su
 * perfil (`userProfileToPatch`) y trae: first_name, last_name, brand, model,
 * color, plate, dni, vehicle_type, year, driver_photo_url...
 *
 * Regla del proyecto: nunca pintar un identificador técnico donde va un nombre y
 * nunca inventar un dato. Cuando falta, queda vacío y la pantalla muestra "—".
 */

import { VehicleData } from '../types';

export interface DatosPublicos {
  nombres: string;
  apellidos: string;
  telefono: string;
  dni: string;
  marca: string;
  modelo: string;
  color: string;
  placa: string;
  /** URL de la foto del conductor o del proveedor, si la subió. */
  foto: string;
}

/** Fila cruda de `public_profile`. Todos los campos pueden venir nulos. */
export interface FilaPerfilPublico {
  full_name?: string | null;
  phone?: string | null;
  vehicle_data?: Record<string, unknown> | null;
}

/** Mismo objeto, pero admite VehicleData sin perder la tipificación. */
export type FilaPerfilConVehicleData = Omit<FilaPerfilPublico, 'vehicle_data'> & {
  vehicle_data?: Record<string, unknown> | VehicleData | null;
};

function texto(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  return '';
}

/**
 * Parte un nombre completo en nombres y apellidos.
 *
 * El perfil guarda `first_name` y `last_name` por separado, así que esto es solo
 * el respaldo para perfiles viejos o incompletos. Heurística: en 4 palabras se
 * reparte 2 y 2 (que es el caso normal peruano: "Mario André Baldeón Andía"); en
 * 3 palabras, 2 y 1; en el resto, la primera palabra y el resto.
 */
export function partirNombre(fullName: string | null | undefined): {
  nombres: string;
  apellidos: string;
} {
  const partes = texto(fullName).split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { nombres: '', apellidos: '' };
  if (partes.length === 1) return { nombres: partes[0], apellidos: '' };
  const corte = partes.length >= 4 ? 2 : 1;
  return { nombres: partes.slice(0, corte).join(' '), apellidos: partes.slice(corte).join(' ') };
}

/** Convierte la fila de `public_profile` en los datos que se pintan en la tarjeta. */
export function datosDesdePerfilPublico(fila: FilaPerfilPublico | null): DatosPublicos {
  const vehiculo = (fila?.vehicle_data || {}) as Record<string, unknown>;
  const delVehiculo = {
    nombres: texto(vehiculo.first_name),
    apellidos: texto(vehiculo.last_name),
  };
  // Si el perfil no trae el nombre partido, se deduce del nombre completo.
  const deducido = partirNombre(fila?.full_name);
  const foto =
    texto(vehiculo.driver_photo_url) ||
    texto(vehiculo.provider_photo_url) ||
    texto(vehiculo.photo_url);

  return {
    nombres: delVehiculo.nombres || deducido.nombres,
    apellidos: delVehiculo.apellidos || deducido.apellidos,
    telefono: texto(fila?.phone),
    dni: texto(vehiculo.dni),
    marca: texto(vehiculo.brand),
    modelo: texto(vehiculo.model),
    color: texto(vehiculo.color),
    placa: texto(vehiculo.plate),
    foto,
  };
}

/** Valor para pantalla: el dato o "—" si no lo tenemos. */
export function conGuion(valor: string): string {
  return valor && valor.length > 0 ? valor : '—';
}

/**
 * Texto que copia el botón "Copiar datos" del chat del servicio.
 *
 * Nombres y apellidos van en campos SEPARADOS: el bug era que el nombre completo
 * caía en "Nombres" (nombres + apellidos juntos) y todo lo demás salía vacío, porque
 * el dato no se leía de ningún perfil. Ahora sale del perfil real y lo que de verdad
 * falta se marca con "—" (nunca se inventa un dato).
 */
export function textoParaCopiar(datos: DatosPublicos, titulo = 'Datos del conductor'): string {
  return `${titulo}
=====================
Nombres: ${conGuion(datos.nombres)}
Apellidos: ${conGuion(datos.apellidos)}
DNI: ${conGuion(datos.dni)}
Teléfono: ${conGuion(datos.telefono)}

Datos del Vehículo
=====================
Marca: ${conGuion(datos.marca)}
Modelo: ${conGuion(datos.modelo)}
Color: ${conGuion(datos.color)}
Placa: ${conGuion(datos.placa)}`;
}

/** Primera letra para el avatar cuando no hay foto. */
export function inicialDe(datos: DatosPublicos): string {
  const base = datos.nombres || datos.apellidos;
  return base ? base.charAt(0).toUpperCase() : '?';
}
