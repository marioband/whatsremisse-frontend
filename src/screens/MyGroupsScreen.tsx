import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Animated,
} from 'react-native';

import { BotonDeBusqueda, BarraDeBusqueda } from '../components/Busqueda';
import { Fab } from '../components/Fab';
import { useAuth } from '../context/AuthContext';
import { useMockStore, GroupItem } from '../context/MockStoreContext';
import { useFilasDeslizantes } from '../hooks/useFilasDeslizantes';
import { useRealtimeMisGrupos } from '../hooks/useRealtimeMisGrupos';
import { camposDeBusquedaDeGrupo, filtrarPorBusqueda } from '../lib/busqueda';
import { TEXTO_SUAVE } from '../lib/colors';
import { fetchResumenDeMisGrupos, fetchUltimoMensajePorGrupo, ResumenDeGrupoDeLaLista } from '../lib/database';
import { horaDelUltimoMensaje } from '../lib/horaDelMensaje';
import { vistaPreviaDelMensaje } from '../lib/mensajes';
import { colorDeLaTarjeta, ordenarGrupos } from '../lib/ordenDeGrupos';
import { RootStackParamList } from '../navigation/RootNavigator';

type GroupsNav = StackNavigationProp<
  RootStackParamList,
  'GroupChat' | 'GroupMembers' | 'CreateGroup' | 'Settings'
>;

const DARK_BG = '#2D2D2D';
const LIGHT_BG = '#FFFFFF';
/** Separación entre tarjetas: el `marginBottom` de `styles.card` (ver `medirLaFila`). */
const MARGEN_ENTRE_TARJETAS = 12;

export function MyGroupsScreen() {
  const navigation = useNavigation<GroupsNav>();
  const { groups, sinLeerDeGrupos: sinLeer, refrescarSinLeer } = useMockStore();
  const { session } = useAuth();
  const miId = session?.user?.id ?? null;

  /**
   * La lupa de Mis grupos (18-09-2026): busca por el nombre del grupo —lo que se ve en la
   * tarjeta— y sin acentos, así que "newlan" encuentra "Newlan" y "grupo prueba" encuentra
   * "Grupo de Prueba Andre".
   */
  const [buscarAbierto, setBuscarAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');

  /**
   * El globo con el contador de sin leer, por grupo (0028), y el silencio de cada uno.
   *
   * El contador sale de la base (`grupos_sin_leer`): cuenta lo que llegó después de la última vez
   * que se abrió el chat del grupo, sin contar lo propio. Se recarga cada vez que la pantalla
   * vuelve al frente, que es cuando puede haber cambiado.
   */
  // El mapa vive en el almacén (`sinLeerDeGrupos`, de `grupos_sin_leer`): así el número del botón
  // «Mis grupos» —la suma de todos— y el globo de cada tarjeta salen del MISMO dato y no pueden
  // contradecirse (20-09-2026).

  /**
   * Cuándo llegó el último mensaje de cada grupo (`grupos_ultimo_mensaje`, 0036). Es lo que
   * ordena los grupos que solo integro (pedido del usuario, 20-09-2026): se recarga al volver
   * a la pantalla, que es cuando puede haber cambiado.
   */
  const [ultimoMensaje, setUltimoMensaje] = useState<Record<string, number>>({});

  /**
   * El resumen de cada grupo (23-09-2026, migración 0044): el último mensaje con su autor, su tipo y
   * la hora. Es lo que pinta la tarjeta como WhatsApp (antes solo se sabía CUÁNDO llegó el último
   * recibido, para ordenar). Sin la 0044 llega vacío y la lista se queda como estaba.
   */
  const [resumen, setResumen] = useState<Record<string, ResumenDeGrupoDeLaLista>>({});

  const cargarDatosDeLosGrupos = useCallback(() => {
    void refrescarSinLeer();
    void fetchResumenDeMisGrupos()
      .then((datos) => {
        setResumen(datos);
        // Si la 0044 todavía no está aplicada no hay resumen: se ordena con la 0036, como antes.
        if (Object.keys(datos).length > 0) return undefined;
        return fetchUltimoMensajePorGrupo().then(setUltimoMensaje);
      })
      .catch(() => undefined);
  }, [refrescarSinLeer]);

  useFocusEffect(cargarDatosDeLosGrupos);

  // Y EN VIVO (20-09-2026): con la pantalla abierta, un mensaje nuevo tiene que mover el grupo de
  // sitio y encender el globo SIN salir y volver (antes solo se veía al regresar).
  useRealtimeMisGrupos(
    useMemo(() => groups.map((g) => g.id), [groups]),
    miId,
    cargarDatosDeLosGrupos
  );

  // El corazón, el engrane y el botón de silenciar vivían aquí, en la tarjeta; el usuario los
  // mudó al CHAT DEL GRUPO y a sus ajustes (20-09-2026).

  /**
   * El orden y el color de las tarjetas salen de `lib/ordenDeGrupos` (propietario →
   * administrador → favorito → integrante), y la lupa filtra esa misma lista.
   */
  const gruposVisibles = useMemo(
    () =>
      filtrarPorBusqueda(
        ordenarGrupos(
          groups.map((grupo) => ({
            ...grupo,
            // La misma regla de siempre: ordena lo RECIBIDO, no lo que escribí yo.
            ultimoMensajeAt: resumen[grupo.id]?.ultimoRecibidoAt ?? ultimoMensaje[grupo.id] ?? null,
          }))
        ),
        consulta,
        camposDeBusquedaDeGrupo
      ),
    [groups, resumen, ultimoMensaje, consulta]
  );

  /**
   * El arrastre al reordenar: al cambiar de sitio —por marcar un favorito (18-09-2026) o porque
   * el grupo acaba de recibir un mensaje (20-09-2026)— la tarjeta se desliza desde donde estaba
   * en vez de aparecer de golpe. La animación y la medición del alto de fila viven en
   * `hooks/useFilasDeslizantes` (las mismas que ahora usan las tarjetas de servicios).
   */
  const { valorDe, medirLaFila } = useFilasDeslizantes(
    useMemo(() => gruposVisibles.map((g) => g.id), [gruposVisibles]),
    MARGEN_ENTRE_TARJETAS
  );

  const renderGroupCard = ({ item, index }: { item: GroupItem; index: number }) => {
    const deEste = resumen[item.id];
    const vista = deEste
      ? vistaPreviaDelMensaje({
          tipo: deEste.ultimoTipo,
          texto: deEste.ultimoTexto,
          autor: deEste.ultimoAutor,
          esMio: deEste.ultimoEsMio,
        })
      : '';
    const hora = deEste ? horaDelUltimoMensaje(deEste.ultimoAt) : '';
    const nuevos = sinLeer[item.id] ?? 0;
    return (
    /* La capa que se desliza al reordenar: su `translateY` arranca en la distancia hasta
       su hueco viejo y vuelve a 0 (donde le toca ahora). */
    <Animated.View
      style={{ transform: [{ translateY: valorDe(item.id) }] }}
      onLayout={medirLaFila(index)}
    >
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colorDeLaTarjeta(item) }]}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('GroupChat', { groupId: item.id, groupName: item.name })}
      >
        {/* Avatar: la foto del grupo si la tiene (0038); si no, su inicial. */}
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
          </View>
        )}

        {/* 23-09-2026, como WhatsApp: el nombre arriba y, debajo, las DOS primeras líneas del último
            mensaje con quien lo escribió. Los dos van pegados a la imagen del grupo (el nombre ya no
            va centrado: dejaba un hueco raro entre la foto y el texto). */}
        <View style={styles.textos}>
          <Text style={styles.groupName} numberOfLines={1}>
            {item.name}
          </Text>
          {vista !== '' && (
            <Text style={styles.vistaPrevia} numberOfLines={2}>
              {vista}
            </Text>
          )}
        </View>

        {/* A la derecha, como WhatsApp: la hora del último mensaje y debajo los iconos — silenciado,
            fijado— y el globo de mensajes sin leer. El texto «Admin» NO va aquí (lo retiró el usuario
            el 23-09-2026: en este apartado solo iconos). */}
        <View style={styles.derecha}>
          {hora !== '' && <Text style={[styles.hora, nuevos > 0 && styles.horaConNuevos]}>{hora}</Text>}
          <View style={styles.filaDeIconos}>
            {item.muted === true && (
              <MaterialCommunityIcons name="bell-off" size={15} color={TEXTO_SUAVE} />
            )}
            {item.favorite && <MaterialCommunityIcons name="pin" size={15} color={DARK_BG} />}
            {nuevos > 0 && (
              <View style={styles.globoSinLeer}>
                <Text style={styles.globoSinLeerTexto}>{nuevos > 99 ? '99+' : nuevos}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Barra de la lupa: el mismo botón que en los apartados del inicio */}
      <View style={styles.filterBar}>
        <BotonDeBusqueda
          abierto={buscarAbierto}
          onPress={() => {
            setBuscarAbierto((abierto) => !abierto);
            setConsulta('');
          }}
          color={TEXTO_SUAVE}
          tamano={20}
          estilo={styles.filterBtn}
          etiqueta="Buscar grupo"
        />
      </View>

      {buscarAbierto && (
        <BarraDeBusqueda
          consulta={consulta}
          onCambiarConsulta={setConsulta}
          placeholder="Buscar grupo por nombre"
        />
      )}

      {/* Group list */}
      <FlatList
        data={gruposVisibles}
        keyExtractor={(item) => item.id}
        renderItem={renderGroupCard}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {consulta.trim() ? 'Ningún grupo coincide con la búsqueda.' : 'No tienes grupos'}
          </Text>
        }
      />

      {/* FAB */}
      {/* El «+» abre PRIMERO la elección de integrantes y después el nombre (23-09-2026, como
          WhatsApp): el grupo se crea con esa gente dentro. */}
      <Fab
        etiqueta="Agregar grupo"
        onPress={() => navigation.navigate('AddParticipant', { paraGrupoNuevo: true })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /** El globo del contador: oscuro sobre las tarjetas claras. */
  globoSinLeer: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: DARK_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globoSinLeerTexto: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  container: {
    flex: 1,
    backgroundColor: LIGHT_BG,
    /**
     * Sin el hueco SUPERIOR (18-09-2026): va DEBAJO de la cabecera, que ya reserva el
     * notch; con los dos, quedaba una franja blanca entre la barra negra y los botones.
     */
    paddingTop: 0,
  },
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  filterBtn: {
    padding: 8,
    backgroundColor: '#f0f2f5',
    borderRadius: 8,
    minWidth: 36,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 12,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  /** La columna del nombre y la vista previa, pegada a la imagen del grupo. */
  textos: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  /** Las dos primeras líneas del último mensaje («Gregory Medina: Gracias Mario»). */
  vistaPrevia: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B6B6B',
  },
  /** La columna de la derecha: hora arriba, iconos debajo. */
  derecha: {
    marginLeft: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 54,
  },
  hora: {
    fontSize: 11,
    color: '#8A8A8A',
  },
  /** Con mensajes sin leer, la hora se destaca (como el verde de WhatsApp, pero en azul de marca). */
  horaConNuevos: {
    color: '#3F51B5',
    fontWeight: '700',
  },
  filaDeIconos: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
});
