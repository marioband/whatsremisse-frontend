/**
 * ¿El teclado está abierto? En web se deduce del viewport visible (ver `lib/alturaVisible.ts`)
 * y en nativo lo avisa el sistema. Lo usan los chats para quitar su hueco inferior cuando el
 * teclado ya ocupa ese sitio (si no, queda una franja en blanco encima del teclado).
 */
import { useEffect, useState } from 'react';

import { estadoDeAlturaVisible, suscribirAlturaVisible } from '../lib/alturaVisible';

export function useTecladoAbierto(): boolean {
  const [abierto, setAbierto] = useState(() => estadoDeAlturaVisible().teclado);

  useEffect(() => suscribirAlturaVisible((estado) => setAbierto(estado.teclado)), []);

  return abierto;
}
