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

type RoleTab = 'Conductor' | 'Proveedor' | 'Mis Grupos' | 'Ubicaciones';
const ROLE_TABS: RoleTab[] = ['Conductor', 'Proveedor', 'Mis Grupos', 'Ubicaciones'];

/**
 * Rótulo visible de cada pestaña. La clave interna 'Mis Grupos' se conserva (la comparan
 * HomeScreen y MainHeader), pero el usuario pidió que el rótulo diga «Mis grupos» (18-09-2026):
 * esta pantalla pintaba la clave cruda.
 */
const ETIQUETA_DEL_TAB: Record<RoleTab, string> = {
  Conductor: 'Conductor',
  Proveedor: 'Proveedor',
  'Mis Grupos': 'Mis grupos',
  Ubicaciones: 'Ubicaciones',
};

export function SelectGroupsForServiceScreen() {
  const navigation = useNavigation<SelectNav>();
  const route = useRoute<SelectRoute>();
  const { draftService, serviceId } = route.params;
  const { role, setRole, groups, addService, updateService, compartirServicio } = useMockStore();

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

  const activeRoleTab: RoleTab =
    role === 'DRIVER'
      ? 'Conductor'
      : role === 'PROVIDER'
        ? 'Proveedor'
        : role === 'GROUP_OWNER'
          ? 'Mis Grupos'
          : 'Ubicaciones';

  const handleRoleChange = (tab: RoleTab) => {
    if (tab === 'Conductor') setRole('DRIVER');
    if (tab === 'Proveedor') setRole('PROVIDER');
    if (tab === 'Mis Grupos') setRole('GROUP_OWNER');
    if (tab === 'Ubicaciones') setRole('ADMIN');
    navigation.navigate('Main');
  };

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
      {/* Header: la pantalla no tenía título —el usuario lo pidió el 19-09-2026, «podría ser
          Selección de grupos»— y con el título va el atrás, que devuelve AL FORMULARIO del
          servicio para seguir editándolo: la pantalla anterior sigue montada, así que vuelve
          con todo lo escrito (y el borrador del dispositivo es el respaldo). */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Volver a editar el servicio"
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Selección de grupos
          </Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconBtn}>
            <Text style={styles.icon}>👤</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Cuenta"
          >
            <Icono fuente={ICONO_AJUSTES} tamano={22} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Role tabs */}
      <View style={styles.roleBar}>
        {ROLE_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.roleTab, activeRoleTab === tab && styles.roleTabActive]}
            onPress={() => handleRoleChange(tab)}
          >
            <Text style={[styles.roleTabText, activeRoleTab === tab && styles.roleTabTextActive]}>
              {ETIQUETA_DEL_TAB[tab]}
            </Text>
          </TouchableOpacity>
        ))}
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  backBtn: {
    paddingRight: 10,
    paddingVertical: 4,
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
    flexShrink: 1,
  },
  headerIcons: {
    flexDirection: 'row',
  },
  iconBtn: {
    marginLeft: 16,
    padding: 4,
  },
  icon: {
    color: '#fff',
    fontSize: 20,
  },
  roleBar: {
    flexDirection: 'row',
    backgroundColor: DARK_BG,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  roleTabActive: {
    backgroundColor: BLUE,
  },
  roleTabText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
  },
  roleTabTextActive: {
    color: '#fff',
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
