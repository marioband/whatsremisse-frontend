/**
 * Compatibilidad de tokens de color.
 *
 * Este archivo era el SEGUNDO sitio donde vivían colores de la app (el otro es
 * `src/lib/colors.ts`, con 31 archivos importándolo a él). Desde el 10-10-2026 el color
 * vive en `src/lib/colors.ts` y el sistema completo (escalas, movimiento) en
 * `src/lib/diseno.ts`; aquí quedan los MISMOS nombres y valores de siempre para no tocar
 * a quien ya los importa, apuntando a los tokens donde el valor es idéntico.
 *
 * `secondaryText` (#555555) no tiene equivalente exacto en los tokens todavía: se deja
 * literal, es el mismo color de siempre (cambiarlo sin medir sería un cambio visual).
 */
import {
  AZUL,
  BLANCO,
  FONDO_TARJETA,
  OSCURO,
  RADIOS,
  ROJO_ACCION,
  TEXTO,
  TEXTO_TENUE,
  VERDE_ACCION,
} from '../lib/diseno';

export const COLORS = {
  // Headers y superficies oscuras
  header: OSCURO,
  darkText: TEXTO,
  secondaryText: '#555555',
  mutedText: TEXTO_TENUE,

  // Fondos
  background: FONDO_TARJETA,
  white: BLANCO,
  chatBg: BLANCO,
  inputBg: '#F0F2F5',

  // Tarjetas de servicio
  cardNew: FONDO_TARJETA,
  cardAppliedOverlay: 'rgba(139, 149, 201, 0.60)',
  cardAcceptedOverlay: 'rgba(46, 158, 91, 0.60)',
  cardAcceptedInk: '#17452A',
  cardAccepted: VERDE_ACCION,

  // Acentos
  primary: AZUL,
  primaryDark: '#303F9F',
  headerDark: OSCURO,
  brightGreen: VERDE_ACCION,
  orange: '#FF9800',

  // Estados / sistema
  danger: ROJO_ACCION,
  warningBg: '#FFF3E0',
  warningText: '#E65100',
  successBg: '#E8F5E9',
  info: AZUL,

  // Mensajes: el que escribe en azul de marca con texto blanco, el otro en gris
  bubbleMine: AZUL,
  bubbleOther: '#C6C6C6',

  // Acciones
  grayAction: '#6B7280',
  blueAction: AZUL,
} as const;

/** Radio de las esquinas: los mismos valores de siempre (la escala vive en lib/diseno). */
export const RADIUS = {
  sm: RADIOS.sm,
  md: RADIOS.md,
  lg: RADIOS.lg,
  xl: RADIOS.xl,
  pill: RADIOS.pill,
} as const;
