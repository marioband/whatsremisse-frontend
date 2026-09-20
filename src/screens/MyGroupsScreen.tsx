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
import { fetchGruposSinLeer, fetchUltimoMensajePorGrupo } from '../lib/database';
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
  const { groups } = useMockStore();
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
  const [sinLeer, setSinLeer] = useState<Record<string, number>>({});

  /**
   * Cuándo llegó el último mensaje de cada grupo (`grupos_ultimo_mensaje`, 0036). Es lo que
   * ordena los grupos que solo integro (pedido del usuario, 20-09-2026): se recarga al volver
   * a la pantalla, que es cuando puede haber cambiado.
   */
  const [ultimoMensaje, setUltimoMensaje] = useState<Record<string, number>>({});

  const cargarDatosDeLosGrupos = useCallback(() => {
    void fetchGruposSinLeer()
      .then(setSinLeer)
      .catch(() => undefined);
    void fetchUltimoMensajePorGrupo()
      .then(setUltimoMensaje)
      .catch(() => undefined);
  }, []);

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
          groups.map((grupo) => ({ ...grupo, ultimoMensajeAt: ultimoMensaje[grupo.id] ?? null }))
        ),
        consulta,
        camposDeBusquedaDeGrupo
      ),
    [groups, ultimoMensaje, consulta]
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

  const renderGroupCard = ({ item, index }: { item: GroupItem; index: number }) => (
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

        {/* Nombre centrado */}
        <Text style={styles.groupName} numberOfLines={1}>
          {item.name}
        </Text>

        {/* El globo del contador de sin leer, en el hueco que dejaron el corazón y el engrane
            (que se mudaron al chat del grupo, 20-09-2026). Sale solo cuando hay mensajes nuevos. */}
        <View style={styles.globoSlot}>
          {(sinLeer[item.id] ?? 0) > 0 && (
            <View style={styles.globoSinLeer}>
              <Text style={styles.globoSinLeerTexto}>
                {sinLeer[item.id] > 99 ? '99+' : sinLeer[item.id]}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

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
      <Fab etiqueta="Agregar grupo" onPress={() => navigation.navigate('CreateGroup')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /** El hueco del globo: el MISMO sitio donde estaban el corazón y el engrane (20-09-2026). */
  globoSlot: {
    width: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
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
  groupName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginHorizontal: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
});
