import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

import { Icono, ICONO_AJUSTES } from '../components/Icono';
import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import { limpiarBorradorDeServicio } from '../lib/borradorDeServicio';
import { EstadoDeEnvio, estadoDelBotonDeEnvio, opacidadDelBotonDeEnvio } from '../lib/envioUnico';
import { gruposDeServicio } from '../lib/gruposDeServicio';
import { ordenarGrupos } from '../lib/ordenDeGrupos';
import { RootStackParamList } from '../navigation/RootNavigator';

type SelectNav = StackNavigationProp<RootStackParamList, 'SelectGroupsForService' | 'Settings'>;
type SelectRoute = RouteProp<RootStackParamList, 'SelectGroupsForService'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

const ROLE_COLORS = {
  owner: '#C0C7E8',
  admin: '#B2E3BF',
  member: '#F2F2F2',
  favorite: '#FFF59E',
};

export function SelectGroupsForServiceScreen() {
  const navigation = useNavigation<SelectNav>();
  const route = useRoute<SelectRoute>();
  const { draftService, serviceId } = route.params;
  const { groups, addService, updateService, compartirServicio } = useMockStore();

  /**
   * Los grupos en el MISMO orden que «Mis grupos» (pedido del usuario, 19-09-2026): la regla
   * vive en `lib/ordenDeGrupos` (propietario → administrador → favorito → integrante, y dentro
   * de cada uno por nombre). La pantalla no decide el orden por su cuenta, y así el grupo que
   * el usuario ve arriba en Mis grupos es el mismo que ve arriba aquí.
   */
  const gruposComoEnMisGrupos = useMemo(() => ordenarGrupos(groups), [groups]);

  // Si la tarjeta ya está compartida, sus grupos vienen marcados: el "Enviar" vuelve
  // a dejar el conjunto completo (quitar uno lo descomparte de ese grupo).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(gruposDeServicio(draftService))
  );

  // El envío se hace UNA sola vez. `guardandoRef` es la guarda efectiva (síncrona: dos
  // toques en el mismo hueco la ven puesta los dos) y `estado` es la parte visible
  // (botón apagado con "Enviando…"). Con solo `estado` no alcanza: actualizar el estado
  // de React es asíncrono y los dos toques leían "listo".
  const [estado, setEstado] = useState<EstadoDeEnvio>('listo');
  const guardandoRef = useRef(false);
  const boton = estadoDelBotonDeEnvio(estado);

  const toggleGroup = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getCardColor = (group: { role: 'owner' | 'admin' | 'member'; favorite: boolean }) => {
    if (group.favorite) return ROLE_COLORS.favorite;
    return ROLE_COLORS[group.role];
  };

  const handleSend = async () => {
    // Guarda SÍNCRONA: mientras esta publicación está en vuelo, cualquier otro toque
    // vuelve aquí y sale. Antes cada toque publicaba una alerta nueva del mismo
    // servicio (el usuario lo reportó: "se envían varias alertas del mismo servicio").
    if (guardandoRef.current) return;

    if (selectedIds.size === 0) {
      Alert.alert('Selecciona grupos', 'Elige al menos un grupo para publicar el servicio.');
      return;
    }

    guardandoRef.current = true;
    setEstado('enviando');

    // El orden en que se eligieron importa: el primero es el grupo principal.
    const seleccionados = Array.from(selectedIds);
    let publicado = false;

    try {
      if (serviceId) {
        // Tarjeta que YA existe (venía de "nuevo servicio"): se comparte con TODOS los
        // grupos elegidos en el MISMO servicio (0018). Antes se creaba una tarjeta por
        // grupo, así que el conductor que estaba en varios grupos recibía la misma
        // alerta varias veces.
        updateService({ ...draftService, id: serviceId });
        const compartido = await compartirServicio(serviceId, seleccionados);
        if (!compartido) return;
        // El aviso de la tarjeta nueva lo reciben los conductores del grupo (tiempo
        // real): el proveedor que publica no se avisa a sí mismo.
        publicado = true;
        setEstado('publicado');
        Alert.alert(
          'Servicio compartido',
          seleccionados.length === 1
            ? 'La tarjeta ya está publicada en el grupo elegido.'
            : `La tarjeta está publicada en ${seleccionados.length} grupos. Es un solo servicio: los conductores que estén en varios grupos lo ven una sola vez.`
        );
        navigation.navigate('Main');
        return;
      }

      // Tarjeta nueva: se publica UNA vez y se comparte con todos los grupos elegidos.
      const id = await addService({ ...draftService, group_id: '' }, seleccionados);
      // El servicio ya se publicó: el borrador del formulario no debe reaparecer.
      limpiarBorradorDeServicio();
      if (!id) return;

      publicado = true;
      setEstado('publicado');

      navigation.navigate('Main');
    } finally {
      // Si NO se publicó, se suelta el candado para poder reintentar (un fallo de red no
      // debe dejar el botón muerto). Si SÍ se publicó, se queda cerrado: volver a esta
      // pantalla no puede publicar una segunda alerta.
      if (!publicado) {
        guardandoRef.current = false;
        setEstado('listo');
      }
    }
  };

  const renderGroup = ({
    item,
  }: {
    item: { id: string; name: string; role: 'owner' | 'admin' | 'member'; favorite: boolean };
  }) => {
    const selected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: getCardColor(item) }]}
        onPress={() => toggleGroup(item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.leftContent}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
          </View>
          <Text style={styles.groupName} numberOfLines={1}>
            {item.name}
          </Text>
        </View>

        <View style={[styles.selector, selected && styles.selectorActive]}>
          {selected && <Text style={styles.check}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header: título CENTRADO (pedido del usuario, 19-09-2026) con el atrás a la izquierda y
          Cuenta a la derecha. Los dos extremos miden lo mismo para que el título quede en el
          centro exacto, no "centrado dentro de lo que sobra". */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerLado}
          accessibilityRole="button"
          accessibilityLabel="Volver a editar el servicio"
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Selección de grupos
        </Text>
        <TouchableOpacity
          style={[styles.headerLado, styles.headerLadoDerecho]}
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel="Cuenta"
        >
          <Icono fuente={ICONO_AJUSTES} tamano={22} />
        </TouchableOpacity>
      </View>

      {/* Group list */}
      <FlatList
        data={gruposComoEnMisGrupos}
        keyExtractor={(item) => item.id}
        renderItem={renderGroup}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No hay grupos disponibles</Text>}
      />

      {/* Send button: deshabilitado mientras publica (una sola vez por envío) */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.sendBtn, { opacity: opacidadDelBotonDeEnvio(estado) }]}
          onPress={handleSend}
          disabled={boton.deshabilitado}
          accessibilityRole="button"
          accessibilityState={{ disabled: boton.deshabilitado }}
        >
          <Text style={styles.sendText}>{boton.texto}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  /**
   * Los dos extremos miden lo MISMO (44 px) para que el título quede en el centro exacto de la
   * pantalla, no centrado dentro de lo que sobra a los lados (el atrás es más ancho que el icono).
   */
  headerLado: {
    width: 44,
    justifyContent: 'center',
  },
  headerLadoDerecho: {
    alignItems: 'flex-end',
  },
  backArrow: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 30,
    padding: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  groupName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  selector: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#bbb',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  check: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    alignItems: 'center',
  },
  sendBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 80,
    alignItems: 'center',
  },
  sendText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
