import React from 'react';
import { Image, ImageSourcePropType, StyleProp, ImageStyle } from 'react-native';

/**
 * Iconos de la app (los PNG que dio el usuario el 18-09-2026): buscador, ajustes/cuenta
 * y copiar. Sustituyen a los emojis y glifos que había antes (`🔍`, `⌕`, `⚙️`, `📋`),
 * que además se veían distintos en cada teléfono.
 *
 * Viven en `src/iconos/` y no en el `assets/` de la raíz porque ese directorio quedó de
 * root en el VPS y desde el contenedor no se puede escribir en él (mover o crear ahí da
 * "Permission denied"); así los iconos viajan igual en el commit.
 *
 * El dibujo es BLANCO con transparencia, así que donde el fondo no sea oscuro se pinta
 * con `color` — `tintColor` tiñe la máscara conservando la transparencia, igual que un
 * icono de fuente— y el tamaño se fija con `tamano`.
 */
import iconoAjustes from '../iconos/icono-ajustes.png';
import iconoBuscar from '../iconos/icono-buscar.png';
import iconoCopiar from '../iconos/icono-copiar.png';

export const ICONO_BUSCAR: ImageSourcePropType = iconoBuscar;
export const ICONO_AJUSTES: ImageSourcePropType = iconoAjustes;
export const ICONO_COPIAR: ImageSourcePropType = iconoCopiar;

interface IconoProps {
  fuente: ImageSourcePropType;
  /** Lado del cuadrado, en píxeles (el dibujo se ajusta sin deformarse). */
  tamano?: number;
  /** Color con el que se pinta la máscara. Sin él queda el blanco original. */
  color?: string;
  estilo?: StyleProp<ImageStyle>;
}

export function Icono({ fuente, tamano = 20, color, estilo }: IconoProps) {
  return (
    <Image
      source={fuente}
      style={[{ width: tamano, height: tamano }, color ? { tintColor: color } : null, estilo]}
      resizeMode="contain"
    />
  );
}
