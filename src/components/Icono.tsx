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
import iconoCorazonBordeAzul from '../iconos/icono-corazon-borde-azul.png';
import iconoCorazonBorde from '../iconos/icono-corazon-borde.png';
import iconoCorazonLlenoAzul from '../iconos/icono-corazon-lleno-azul.png';
import iconoCorazonLleno from '../iconos/icono-corazon-lleno.png';
import iconoGruposAzul from '../iconos/icono-grupos-azul.png';
import iconoGrupos from '../iconos/icono-grupos.png';

export const ICONO_BUSCAR: ImageSourcePropType = iconoBuscar;
export const ICONO_AJUSTES: ImageSourcePropType = iconoAjustes;
export const ICONO_COPIAR: ImageSourcePropType = iconoCopiar;
/**
 * El engranaje de **Mis grupos** (18-09-2026, el SVG que dio el usuario).
 *
 * NO es el mismo que el avatar de Cuenta: el usuario pidió que solo en esa pantalla se
 * use este. Viene ya pintado en el **negro institucional** (`#2D2D2D`, el `OSCURO` de
 * `lib/colors`), así que se pinta SIN `color`; sobre las tarjetas claras de los grupos
 * se lee bien.
 */
export const ICONO_GRUPOS: ImageSourcePropType = iconoGrupos;
/**
 * Los corazones de **Mis grupos** (18-09-2026, los dos PNG que dio el usuario): el de
 * borde (♡) y el relleno (♥). Vienen ya pintados en `#333333` —el color que el usuario
 * fijó para los dos estados— y recortados a su tinta, así que se pintan SIN `color`;
 * `tamano` es su lado mayor y se usa el mismo que el engranaje (20) para que midan igual.
 */
export const ICONO_CORAZON_BORDE: ImageSourcePropType = iconoCorazonBorde;
export const ICONO_CORAZON_LLENO: ImageSourcePropType = iconoCorazonLleno;

/**
 * El corazón y el engranaje del **chat del grupo** (20-09-2026), en el **azul institucional**
 * (`#3F51B5`).
 *
 * POR QUÉ AZUL: estos dos botones se mudaron de la tarjeta de Mis grupos (fondo claro, donde
 * iban en negro) a la **cabecera del chat del grupo**, que es oscura (`#2D2D2D`): en negro se
 * perdían. Es el MISMO dibujo del usuario, solo cambiado el color —los archivos `…-azul.png`
 * son copias de los suyos con la tinta al azul—, así que se pintan SIN `color`.
 */
export const ICONO_CORAZON_BORDE_AZUL: ImageSourcePropType = iconoCorazonBordeAzul;
export const ICONO_CORAZON_LLENO_AZUL: ImageSourcePropType = iconoCorazonLlenoAzul;
export const ICONO_GRUPOS_AZUL: ImageSourcePropType = iconoGruposAzul;

interface IconoProps {
  fuente: ImageSourcePropType;
  /** Lado del cuadrado, en píxeles (el dibujo se ajusta sin deformarse). */
  tamano?: number;
  /** Color con el que se pinta la máscara. Sin él queda el blanco original. */
  color?: string;
  /**
   * Estira el dibujo a la caja en vez de encajarlo sin deformar (18-09-2026, el avatar de
   * la cabecera: el usuario lo quería "un poco más ancho"). Con `contain` una caja más
   * ancha solo añade aire a los lados; con `stretch` el dibujo ocupa el ancho pedido.
   */
  estirar?: boolean;
  estilo?: StyleProp<ImageStyle>;
}

export function Icono({ fuente, tamano = 20, color, estirar, estilo }: IconoProps) {
  return (
    <Image
      source={fuente}
      style={[{ width: tamano, height: tamano }, color ? { tintColor: color } : null, estilo]}
      resizeMode={estirar ? 'stretch' : 'contain'}
    />
  );
}
