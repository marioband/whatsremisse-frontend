import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  LayoutChangeEvent,
  Platform,
} from 'react-native';

import { BotonDeBusqueda, BarraDeBusqueda } from '../components/Busqueda';
import { Fab } from '../components/Fab';
import { Icono, ICONO_CORAZON_BORDE, ICONO_CORAZON_LLENO, ICONO_GRUPOS } from '../components/Icono';
import { useMockStore, GroupItem } from '../context/MockStoreContext';
import { useArrastreDeReordenamiento } from '../hooks/useArrastreDeReordenamiento';
import { camposDeBusquedaDeGrupo, filtrarPorBusqueda } from '../lib/busqueda';
import { TEXTO_SUAVE } from '../lib/colors';
import { colorDeLaTarjeta, ordenarGrupos } from '../lib/ordenDeGrupos';
import { RootStackParamList } from '../navigation/RootNavigator';

type GroupsNav = StackNavigationProp<
  RootStackParamList,
  'GroupChat' | 'GroupMembers' | 'CreateGroup' | 'Settings'
>;

const DARK_BG = '#2D2D2D';
const LIGHT_BG = '#F0F2F5';
/** Separación entre tarjetas: el `marginBottom` de `styles.card` (ver `medirLaFila`). */
const MARGEN_ENTRE_TARJETAS = 12;

export function MyGroupsScreen() {
  const navigation = useNavigation<GroupsNav>();
  const { groups, toggleFavoriteGroup } = useMockStore();

  /**
   * La lupa de Mis grupos (18-09-2026): busca por el nombre del grupo —lo que se ve en la
   * tarjeta— y sin acentos, así que "newlan" encuentra "Newlan" y "grupo prueba" encuentra
   * "Grupo de Prueba Andre".
   */
  const [buscarAbierto, setBuscarAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');

  /**
   * El orden y el color de las tarjetas salen de `lib/ordenDeGrupos` (propietario →
   * administrador → favorito → integrante), y la lupa filtra esa misma lista.
   */
  const gruposVisibles = useMemo(
    () => filtrarPorBusqueda(ordenarGrupos(groups), consulta, camposDeBusquedaDeGrupo),
    [groups, consulta]
  );

  /**
   * El arrastre al reordenar (18-09-2026): al marcar un favorito, el grupo cambia de
   * categoría y sube o baja de sitio. En vez de aparecer de golpe en su hueco nuevo, se
   * desliza desde donde estaba (`lib/reordenar.ts` + `useArrastreDeReordenamiento`).
   *
   * El alto de una fila se mide de la primera tarjeta que se pinta: con él, el
   * desplazamiento inicial es exactamente la distancia entre los dos huecos.
   */
  const [altoDeFila, setAltoDeFila] = useState(0);
  const { valorDe } = useArrastreDeReordenamiento(
    useMemo(() => gruposVisibles.map((g) => g.id), [gruposVisibles]),
    altoDeFila
  );

  /**
   * El alto de una fila (tarjeta + separación), que es lo que se desliza al reordenar.
   * Se mide de la tarjeta que se pinta, con dos fuentes porque ninguna sirve sola:
   *
   *   - La distancia entre dos `layout.y` consecutivos es la medida exacta… pero en web
   *     el `layout.y` de las filas de un `FlatList` llega **0 en todas** (`react-native-web`
   *     no lo rellena), así que por sí sola deja el alto en 0 y el arrastre no se vería.
   *   - El `layout.height` de la fila sí llega bien, pero su significado cambia según la
   *     plataforma: en web ya trae dentro el `marginBottom` de la tarjeta (86) y en nativo
   *     no (74), de ahí el `+ MARGEN_ENTRE_TARJETAS` fuera de web.
   */
  const posicionesDeLasFilas = useRef<Record<number, number>>({});

  const medirLaFila = (indice: number) => (evento: LayoutChangeEvent) => {
    const { y, height } = evento.nativeEvent.layout;
    posicionesDeLasFilas.current[indice] = y;
    const siguiente = posicionesDeLasFilas.current[indice + 1];
    const distancia = siguiente === undefined ? 0 : Math.abs(siguiente - y);
    const alto =
      distancia > 0 ? distancia : Platform.OS === 'web' ? height : height + MARGEN_ENTRE_TARJETAS;
    if (alto > 0 && Math.abs(alto - altoDeFila) > 0.5) setAltoDeFila(alto);
  };

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
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
        </View>

        {/* Nombre centrado */}
        <Text style={styles.groupName} numberOfLines={1}>
          {item.name}
        </Text>

        {/* Acciones */}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => toggleFavoriteGroup(item.id)}
            style={styles.actionBtn}
            accessibilityLabel={item.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
          >
            {/* Los dos corazones son los PNG del usuario (18-09-2026), en #333333 y del
              mismo tamaño que el engranaje de al lado. */}
            <Icono fuente={item.favorite ? ICONO_CORAZON_LLENO : ICONO_CORAZON_BORDE} tamano={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() =>
              navigation.navigate('GroupMembers', { groupId: item.id, groupName: item.name })
            }
            accessibilityLabel="Integrantes del grupo"
          >
            {/* El engranaje de grupos, en negro institucional (no el avatar de Cuenta). */}
            <Icono fuente={ICONO_GRUPOS} tamano={20} />
          </TouchableOpacity>
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
  container: {
    flex: 1,
    backgroundColor: LIGHT_BG,
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 8,
    marginLeft: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
});
