import React from 'react';
import { View, Text, FlatList, Platform, StyleSheet, TouchableOpacity } from 'react-native';

import { ContenidoDelMensaje } from './ContenidoDelMensaje';
import { NotaDeVoz } from './NotaDeVoz';
import { Palomas } from './Palomas';
import { AZUL, TEXTO } from '../../lib/colors';
import { textoDelSistema } from '../../lib/mensajes';
import { ContextoDePalomas, LecturaDeChat, estadoDePalomas } from '../../lib/palomas';
import { Message } from '../../types';

interface MessageListProps {
  messages: Message[];
  mySenderId: string;
  listRef: React.RefObject<FlatList>;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  /**
   * Menú de acciones de un mensaje PROPIO (editar / eliminar). Solo se ofrece en
   * los mensajes que escribió este usuario; los del sistema y los del otro no se
   * pueden tocar, así que no se pintan como tocables.
   */
  onActions?: (message: Message) => void;
  /**
   * Confirmación de lectura (0020): quiénes más participan, hasta cuándo leyó cada
   * uno y si el chat tiene base compartida. Sin este contexto no se pinta ninguna
   * palomita (es lo que pasa si la 0020 no está aplicada).
   */
  palomas?: { participantes: string[]; lecturas: LecturaDeChat[]; hayBase: boolean };
}

/**
 * Colores de las burbujas (fijados con el usuario): fondo del chat blanco,
 * azul de marca para quien escribe (texto blanco) y gris para el otro
 * (texto oscuro). Antes eran los verdes de WhatsApp (#dcf8c6 / #fff).
 */
const MY_BUBBLE = AZUL;
const OTHER_BUBBLE = '#C6C6C6';

const COLORS_MINE = {
  text: '#FFFFFF',
  time: 'rgba(255,255,255,0.75)',
  bar: 'rgba(255,255,255,0.30)',
  progress: '#FFFFFF',
};

const COLORS_OTHER = {
  text: TEXTO,
  time: '#555555',
  bar: 'rgba(0,0,0,0.12)',
  progress: AZUL,
};

/**
 * Cuánto hay que MANTENER PULSADO un mensaje para que salga el menú de editar/eliminar.
 *
 * 0,5 s es el tiempo que usa WhatsApp (el usuario lo pidió el 19-09-2026: «la acción de
 * eliminar chat debe activarse al mantener pulsado el texto durante 2 segundos o el tiempo que
 * usa whatsapp»). Vale para el chat del servicio y el del grupo: es el mismo gesto.
 */
export const DELAY_PULSACION_LARGA_MS = 500;

export function MessageList({
  messages,
  mySenderId,
  listRef,
  ListHeaderComponent,
  onActions,
  palomas,
}: MessageListProps) {
  const renderItem = ({ item }: { item: Message }) => {
    const isSystem = item.type === 'SYSTEM';
    const isMine = item.sender_id === mySenderId;
    const palette = isMine ? COLORS_MINE : COLORS_OTHER;

    if (isSystem) {
      return (
        <View style={styles.systemBubble}>
          {/* Los tres avisos del hito del viaje llevan la hora al final
              ("Sistema: Viaje iniciado. 9:30pm"); sale de la fecha del mensaje, que es
              la que guarda la base. Ver `lib/mensajes.ts`. */}
          <Text style={styles.systemText}>{textoDelSistema(item)}</Text>
        </View>
      );
    }

    const time = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    // El mensaje editado solo se declara como editado: el texto anterior no se
    // guarda ni se muestra en ninguna parte (regla del usuario).
    const marca = item.edited_at ? `${time} · editado` : time;

    // Palomitas: solo en los mensajes propios (como WhatsApp).
    const contextoDePalomas: ContextoDePalomas = {
      esMio: isMine,
      participantes: palomas?.participantes ?? [],
      lecturas: palomas?.lecturas ?? [],
      hayBase: palomas?.hayBase,
    };
    const estado = palomas ? estadoDePalomas(item, contextoDePalomas) : null;

    const horaYPalomas = (
      <View style={styles.timeRow}>
        <Text style={[styles.time, { color: palette.time }]}>{marca}</Text>
        <Palomas estado={estado} />
      </View>
    );

    // Los mensajes propios se pueden editar o eliminar: el menú se abre MANTENIENDO PULSADO
    // (regla del usuario, 19-09-2026: «la acción de eliminar chat debe activarse al mantener
    // pulsado el texto», con el tiempo de WhatsApp ≈ 0,5 s). Antes, en web se abría además con
    // un clic suelto: eso hacía que un toque normal —querer seleccionar o copiar— sacara el menú
    // de borrar, así que se quitó. En iPhone el sistema se comía la pulsación larga con su
    // propio menú de texto: por eso la fila va marcada (`data-mensaje`) y el CSS de `App.tsx`
    // apaga ahí el "callout" y la selección.
    const tocable = !!onActions && isMine;
    const abrirMenu = () => onActions?.(item);

    const fila = (burbuja: React.ReactElement) =>
      tocable ? (
        <TouchableOpacity
          style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}
          onLongPress={abrirMenu}
          delayLongPress={DELAY_PULSACION_LARGA_MS}
          activeOpacity={0.85}
          {...(Platform.OS === 'web' ? { dataSet: { mensaje: 'tocable' } } : null)}
        >
          {burbuja}
        </TouchableOpacity>
      ) : (
        <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>{burbuja}</View>
      );

    if (item.type === 'VOICE') {
      // Nota de voz de verdad (19-09-2026): se reproduce al tocarla, con su barra de avance.
      // `metadata.url` es el audio en el almacén; `duration` los segundos que duró.
      return fila(
        <View
          style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble, styles.voiceBubble]}
        >
          <NotaDeVoz
            url={(item.metadata?.url as string) || undefined}
            duracionSegundos={(item.metadata?.duration as number) || 0}
            esMio={isMine}
            colorBarra={palette.bar}
            colorAvance={palette.progress}
            colorTiempo={palette.time}
          />
          {horaYPalomas}
        </View>
      );
    }

    // Foto y ubicación (migración 0026): cada clase con su contenido, dentro de la burbuja
    // de siempre (la foto va a sangre: sin relleno lateral).
    return fila(
      <View
        style={[
          styles.bubble,
          isMine ? styles.myBubble : styles.otherBubble,
          item.type === 'PHOTO' && styles.photoBubble,
        ]}
      >
        <ContenidoDelMensaje
          tipo={item.type}
          contenido={item.content}
          metadata={item.metadata}
          estiloTexto={[styles.messageText, { color: palette.text }]}
          colorDelEnlace={palette.time}
        />
        {horaYPalomas}
      </View>
    );
  };

  /**
   * ¿La persona está mirando el final de la conversación?
   *
   * POR QUÉ: al llegar un mensaje más alto que la pantalla, la lista crece por abajo y la vista se
   * queda donde estaba, así que el mensaje nuevo queda fuera: en la práctica se ve como si el chat
   * SUBIERA en vez de bajar (reporte del usuario, 19-09-2026). Se sigue el final solo si ya estabas
   * abajo; si estás leyendo más arriba, no se te mueve nada.
   */
  const pegadoAlFinal = React.useRef(true);
  const alDesplazar = (evento: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = evento.nativeEvent;
    const distanciaAlFinal = contentSize.height - layoutMeasurement.height - contentOffset.y;
    pegadoAlFinal.current = distanciaAlFinal < 60;
  };
  /**
   * Al cambiar el tamaño de la lista se baja al final, y se vuelve a intentar un suspiro después:
   * el contenido crece en dos tiempos (primero el hueco del mensaje, luego la imagen o el audio que
   * terminan de medirse) y con la animación el desplazamiento se perdía a mitad de camino.
   */
  const alCambiarElTamano = () => {
    if (!pegadoAlFinal.current) return;
    listRef.current?.scrollToEnd({ animated: false });
    setTimeout(() => {
      if (pegadoAlFinal.current) listRef.current?.scrollToEnd({ animated: false });
    }, 250);
  };

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      // `flex: 1`: la lista se queda con el hueco que dejan la cabecera y la barra de
      // escribir, y es ELLA la que se desplaza (sin esto podía crecer con su contenido
      // y empujar la barra fuera de la pantalla). El que decide el alto de la pantalla
      // es la card del navegador: ver `cardStyle` en RootNavigator.
      style={styles.lista}
      contentContainerStyle={styles.list}
      onContentSizeChange={alCambiarElTamano}
      onScroll={alDesplazar}
      scrollEventThrottle={16}
      ListHeaderComponent={ListHeaderComponent}
    />
  );
}

const styles = StyleSheet.create({
  /** Ocupa el espacio que deja la cabecera y la barra de escribir (que van fijas). */
  lista: { flex: 1 },
  list: { padding: 12 },
  /**
   * La fila es la que se pega a un lado y limita el ancho de la burbuja: antes el
   * `maxWidth` y el `alignSelf` vivían en la burbuja, pero al envolverla para
   * escuchar la pulsación larga la alineación tiene que ir en el contenedor.
   */
  row: { maxWidth: '80%', marginBottom: 8 },
  rowRight: { alignSelf: 'flex-end' },
  rowLeft: { alignSelf: 'flex-start' },
  bubble: {
    padding: 10,
    borderRadius: 12,
    elevation: 1,
  },
  myBubble: { backgroundColor: MY_BUBBLE },
  otherBubble: { backgroundColor: OTHER_BUBBLE },
  voiceBubble: { minWidth: 180 },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceIcon: { fontSize: 18, marginRight: 8 },
  voiceBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginRight: 8,
  },
  voiceProgress: {
    width: '60%',
    height: '100%',
    borderRadius: 2,
  },
  voiceDuration: { fontSize: 12 },
  messageText: { fontSize: 15 },
  /** La foto va a sangre dentro de la burbuja (sin relleno lateral). */
  photoBubble: { paddingHorizontal: 6, paddingTop: 6 },
  systemBubble: { alignSelf: 'center', marginVertical: 8 },
  systemText: { fontSize: 12, color: '#666', fontStyle: 'italic', textAlign: 'center' },
  /** Hora + palomitas, pegadas al borde derecho de la burbuja. */
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  time: { fontSize: 10 },
});
