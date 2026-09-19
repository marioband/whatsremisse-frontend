import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { duracionEnTexto } from '../../lib/grabacionDeAudio';

/**
 * La burbuja de una nota de voz: se reproducción de verdad, con su barra de avance.
 *
 * Antes las notas de voz eran un dibujo: el micrófono mandaba un texto inventado
 * («🎤 Nota de voz (0:03)») y la burbuja pintaba una barra que nunca avanzaba. Con la
 * grabación de verdad (19-09-2026) hace falta poder oírla, así que aquí va el reproductor:
 * tocar reproduce y pausa, la barra avanza y el tiempo sale del audio.
 *
 * En web usa el `<audio>` del navegador (que es lo que el iPhone ya trae). En nativo no hay
 * reproductor instalado (`expo-av` no está entre las dependencias): ahí se queda la barra
 * quieta con la duración, sin mentir sobre nada.
 */
interface Props {
  /** URL pública del audio en el almacén. */
  url?: string;
  /** Lo que dura, en segundos (lo que quedó guardado en el mensaje). */
  duracionSegundos?: number;
  /** ¿Es un mensaje mío? (colores de la burbuja) */
  esMio: boolean;
  /** Colores de la burbuja, para que la barra se vea sobre azul o sobre gris. */
  colorBarra: string;
  colorAvance: string;
  colorTiempo: string;
}

export function NotaDeVoz({
  url,
  duracionSegundos = 0,
  esMio,
  colorBarra,
  colorAvance,
  colorTiempo,
}: Props) {
  const [reproduciendo, setReproduciendo] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const audioRef = useRef<any>(null);

  const puedeReproducir = Platform.OS === 'web' && !!url && typeof Audio !== 'undefined';

  // Al desmontar (o al cambiar de mensaje) se corta el audio: si no, sigue sonando.
  useEffect(
    () => () => {
      try {
        audioRef.current?.pause();
      } catch {
        /* nada */
      }
      audioRef.current = null;
    },
    []
  );

  const alternar = () => {
    if (!puedeReproducir) return;
    if (!audioRef.current) {
      const audio = new Audio(url);
      audio.onended = () => {
        setReproduciendo(false);
        setSegundos(0);
        try {
          audio.currentTime = 0;
        } catch {
          /* nada */
        }
      };
      audio.ontimeupdate = () => setSegundos(audio.currentTime || 0);
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (reproduciendo) {
      audio.pause();
      setReproduciendo(false);
      return;
    }
    // El toque es el permiso que pide el navegador para sonar: aquí sí se puede reproducir.
    audio.play().then(
      () => setReproduciendo(true),
      () => setReproduciendo(false)
    );
  };

  const total = Math.max(segundos, duracionSegundos, 0.1);
  const avance = Math.min(1, segundos / total);

  return (
    <View style={styles.fila}>
      <TouchableOpacity
        onPress={alternar}
        disabled={!puedeReproducir}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={reproduciendo ? 'Pausar la nota de voz' : 'Reproducir la nota de voz'}
      >
        {/* El mismo icono para los dos estados: antes eran dos glifos de texto (⏸ y ▶) y se
            veían de formatos distintos (el usuario lo reportó el 19-09-2026). Ahora los dos
            salen de la familia de iconos de la app, con el mismo cuerpo. */}
        <MaterialCommunityIcons
          name={reproduciendo ? 'pause' : 'play'}
          size={18}
          color={esMio ? '#FFFFFF' : colorTiempo}
        />
      </TouchableOpacity>
      <View style={[styles.barra, { backgroundColor: colorBarra }]}>
        <View
          style={[
            styles.avance,
            { backgroundColor: colorAvance, width: `${Math.round(avance * 100)}%` },
          ]}
        />
      </View>
      <Text style={[styles.tiempo, { color: colorTiempo }]}>
        {duracionEnTexto(reproduciendo || segundos > 0 ? segundos * 1000 : duracionSegundos * 1000)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', minWidth: 160 },
  icono: { fontSize: 16, fontWeight: '700', paddingHorizontal: 4 },
  barra: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  avance: { height: 5, borderRadius: 3 },
  tiempo: { fontSize: 11, minWidth: 30, textAlign: 'right' },
});
