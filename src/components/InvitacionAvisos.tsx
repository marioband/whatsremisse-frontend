import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Alert } from '../lib/alert';
import { activarAvisos, estadoDeAvisos, estaInstalada } from '../lib/avisosWeb';
import { leerCache, guardarCache } from '../lib/cache';
import {
  AZUL,
  ESPACIADO,
  FONDO_TARJETA,
  INTERLINEADO,
  PESO,
  RADIOS,
  TALLAS,
  ALTURAS,
  TEXTO,
  TEXTO_SUAVE,
  TEXTO_TENUE,
} from '../lib/diseno';

/**
 * La invitación a activar los avisos, la primera vez que se abre la app.
 *
 * POR QUÉ EXISTE: hasta ahora había que descubrir por cuenta propia que los avisos se activan en
 * Cuenta → Avisos, así que casi nadie los tenía. Lo pidió el usuario el 19-09-2026: «al iniciar por
 * primera vez el app, este debe solicitar activar las notificaciones».
 *
 * Se pregunta UNA vez: al activarlos o al decir «ahora no», queda anotado en el teléfono y no
 * vuelve a aparecer (si los activa desde Cuenta, aquí tampoco pregunta: mira el estado real).
 *
 * Va como tarjeta dentro de la app y no como ventana del navegador porque en la versión web las
 * ventanas de sistema no son fiables, y porque el permiso de iOS necesita un toque de la persona.
 */
const CLAVE_INVITACION = 'avisos:invitacion-vista';
const SIN_CADUCIDAD = 3153600000000; // 100 años: es un "ya se lo pregunté", no un dato que caduque

export function InvitacionAvisos() {
  const [visible, setVisible] = useState(false);
  const [instalada, setInstalada] = useState(true);
  const [activando, setActivando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Si ya están activos, no hay nada que preguntar.
      const estado = await estadoDeAvisos().catch(() => null);
      if (!vivo || estado === 'activo') return;
      const yaPreguntado = await leerCache<boolean>(CLAVE_INVITACION, SIN_CADUCIDAD).catch(
        () => null
      );
      if (!vivo || yaPreguntado) return;
      setInstalada(estaInstalada());
      setVisible(true);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const cerrar = async () => {
    setVisible(false);
    await guardarCache(CLAVE_INVITACION, true, SIN_CADUCIDAD).catch(() => undefined);
  };

  const activar = async () => {
    setActivando(true);
    const resultado = await activarAvisos().catch(() => ({
      ok: false,
      motivo: 'No se pudieron activar los avisos.',
    }));
    setActivando(false);
    if (resultado && resultado.ok === false) {
      Alert.alert('No se pudieron activar', resultado.motivo || 'Inténtalo desde Cuenta → Avisos.');
    }
    await cerrar();
  };

  if (!visible) return null;

  return (
    <View style={styles.tarjeta}>
      <Text style={styles.titulo}>¿Te avisamos al instante?</Text>
      <Text style={styles.texto}>
        Activa los avisos y entérate cuando te postulan, te aceptan o te escriben, sin tener la app
        abierta.
      </Text>
      {!instalada && (
        <Text style={styles.apunte}>
          En iPhone es necesario tener la app instalada en la pantalla de inicio: Safari → Compartir
          → Añadir a pantalla de inicio.
        </Text>
      )}
      <View style={styles.botones}>
        <TouchableOpacity
          onPress={activar}
          disabled={activando}
          style={[styles.boton, styles.primario]}
        >
          <Text style={styles.textoPrimario}>{activando ? 'Activando…' : 'Activar avisos'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={cerrar} style={[styles.boton, styles.secundario]}>
          <Text style={styles.textoSecundario}>Ahora no</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIOS.md,
    padding: ESPACIADO.md,
    marginHorizontal: ESPACIADO.md,
    marginBottom: ESPACIADO.sm,
    borderWidth: 1,
    borderColor: '#E3E6F0',
  },
  titulo: { fontSize: TALLAS.cuerpo, fontWeight: PESO.fuerte, color: TEXTO, marginBottom: 3 },
  texto: { fontSize: TALLAS.etiqueta, color: TEXTO_SUAVE, lineHeight: INTERLINEADO.etiqueta },
  apunte: {
    fontSize: TALLAS.leyenda,
    color: TEXTO_TENUE,
    marginTop: ESPACIADO.xs,
    lineHeight: INTERLINEADO.leyenda,
  },
  botones: { flexDirection: 'row', gap: ESPACIADO.sm, marginTop: ESPACIADO.sm },
  boton: {
    flex: 1,
    minHeight: ALTURAS.toque,
    borderRadius: RADIOS.md,
    paddingVertical: ESPACIADO.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primario: { backgroundColor: AZUL },
  secundario: { backgroundColor: FONDO_TARJETA },
  textoPrimario: { color: '#FFFFFF', fontWeight: PESO.fuerte, fontSize: TALLAS.texto },
  textoSecundario: { color: TEXTO, fontWeight: PESO.medio, fontSize: TALLAS.texto },
});
