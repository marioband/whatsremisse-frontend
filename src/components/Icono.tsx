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
 * **Los PNG están RECORTADOS a su tinta** (18-09-2026): el dibujo es BLANCO con
 * transparencia y cada archivo tiene exactamente la caja de lo que se ve. Es lo que hace
 * que `tamano` signifique lo mismo en los tres: antes el de ajustes traía 21 px de aire
 * alrededor (la tinta era el 50 % de su caja), así que a igual `tamano` la lupa se veía
 * el doble de grande que el avatar y el usuario lo reportó. Si algún día se cambia un
 * PNG, hay que recortarlo igual (receta en el skill del proyecto, sección de iconos:
 * `im.crop(im.split()[3].getbbox())`); los originales sin recortar quedan en
 * `src/iconos/originales/`.
 *
 * Donde el fondo no sea oscuro el icono se pinta con `color` — `tintColor` tiñe la
 * máscara conservando la transparencia, igual que un icono de fuente— y el tamaño se
 * fija con `tamano` (el lado mayor de la tinta).
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
