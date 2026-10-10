/**
 * El sistema de diseño de WhatsRemisse (10-10-2026).
 *
 * POR QUÉ EXISTE: el valor correcto de casi todo ya estaba en la app, pero repartido —
 * medido el 10-10-2026: 813 usos de color escritos a mano fuera de los módulos de tokens,
 * 18 tamaños de letra sin escala, 26 radios distintos y las duraciones de las animaciones
 * sueltas componente a componente. Aquí viven UNA VEZ las decisiones; las pantallas las
 * citan por nombre.
 *
 * Regla de oro (la que ya rige en la casa): los colores se importan, nunca se copia el
 * código. Los HEX solo aparecen en `src/lib/colors.ts`.
 *
 * Escalas: los valores salen de MEDIR lo que la app ya usa (el de más usos en cada rol),
 * no de elegir números lindos: aplicar un token cuyo valor coincide no cambia un píxel.
 *
 * Tipografía: sin fuente propia (decisión del usuario, 10-10-2026): la del sistema, que
 * en Android es Roboto y en iPhone SF — cero peso de descarga y se ve nativa en cada
 * teléfono. `INTERLINEADO` usa PÍXELES ABSOLUTOS y enteros: en React Native un
 * interlineado en decimales (1.35) son 1,35 px y las líneas se pintan una sobre otra
 * (fallo real del 10-10-2026, con prueba que vigila todo `src`).
 */
import { Z_FILA, Z_FILA_ABIERTA } from './desplegables';

export * from './colors';
export * from './movimiento';

/** Separaciones, en la grilla de 4. */
export const ESPACIADO = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

/** Radios de esquina de la casa (`circulo` = pastilla/burbuja totalmente redonda). */
export const RADIOS = { sm: 8, md: 12, lg: 16, xl: 20, pill: 30, circulo: 999 } as const;

/** Tamaños de letra por rol (los que la app ya usa). */
export const TALLAS = {
  micro: 11,
  leyenda: 12,
  etiqueta: 13,
  texto: 14,
  cuerpo: 15,
  subtitulo: 16,
  titulo: 18,
  pantalla: 20,
  heroe: 24,
} as const;

/** Interlineado por rol, en píxeles absolutos (nunca multiplicadores). */
export const INTERLINEADO = {
  micro: 15,
  leyenda: 16,
  etiqueta: 18,
  texto: 20,
  cuerpo: 21,
  subtitulo: 22,
  titulo: 24,
  pantalla: 26,
  heroe: 32,
} as const;

/** Grosores (los que la app ya usa: 'bold' de toda la vida es fuerte). */
export const PESO = { normal: '400', medio: '600', fuerte: '700' } as const;

/** Alturas de los controles que se tocan (44 = el mínimo accesible de WCAG/Apple). */
export const ALTURAS = { toque: 44, input: 44, boton: 52 } as const;

/**
 * Capas (zIndex). El desplegable de sugerencias conserva sus valores y su módulo
 * (`lib/desplegables.ts`, con su prueba); aquí se citan para que nada nuevo invente
 * números por encima de otro.
 */
export const CAPAS = {
  tarjeta: 1,
  barra: 2,
  fab: 50,
  desplegable: Z_FILA,
  desplegableAbierto: Z_FILA_ABIERTA,
  aviso: 9999,
} as const;

/** Sombra suave de tarjeta (la que ya usan las tarjetas del proveedor). */
export const SOMBRAS = {
  tarjeta: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
} as const;
