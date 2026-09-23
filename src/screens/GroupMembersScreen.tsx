import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  Modal,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';

import { Fab } from '../components/Fab';
import { useAuth } from '../context/AuthContext';
import { useMockStore, GroupMember, rolEnGrupo } from '../context/MockStoreContext';
import { elegirFoto, fueCancelado, subirFoto, tomarFoto } from '../lib/adjuntos';
import { Alert } from '../lib/alert';
import { OSCURO, ROJO_ACCION, TEXTO_SUAVE } from '../lib/colors';
import { silenciarGrupo } from '../lib/database';
import { displayName, groupRoleBadgeLabel, initialOf, sortMembersByRole } from '../lib/names';
import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';

type MembersNav = StackNavigationProp<RootStackParamList, 'GroupMembers'>;
type MembersRoute = RouteProp<RootStackParamList, 'GroupMembers'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';
const AVATAR_BG = '#1A1A1A';
/** El gris de los botones de la botonera (el mismo de las tarjetas de grupo). */
const GRIS_BOTON = '#F2F2F2';

/**
 * Los ajustes del grupo (23-09-2026).
 *
 * Referencia del usuario: una captura con la foto del grupo en un círculo grande, debajo los cuatro
 * botones (fijar, silenciar, salir, eliminar) y, en la cabecera, el nombre con un lápiz.
 *
 * Lo que hace esta pantalla, en el orden en que se ve:
 *   1. Cabecera: flecha, NOMBRE del grupo y un lápiz para cambiarlo (creador o administrador).
 *   2. La foto del grupo en un círculo, con un lápiz encima para cambiarla (creador o administrador).
 *   3. La botonera: fijar/desfijar, silencio/sonido, salir (quien no es el creador) y eliminar (solo
 *      el creador, que es a quien la base se lo permite).
 *   4. Debajo, la lista de integrantes —con el + para añadir, si se puede— y el aviso de los que
 *      todavía no tienen perfil.
 *
 * El nombre y la foto se guardan por las funciones `cambiar_nombre_del_grupo` / `cambiar_foto_del_grupo`
 * de la migración 0044: la política de `groups` (0002) solo deja escribir al creador y aquí también
 * puede un administrador. Sin la 0044, la base lo rechaza y se explica el motivo (no se pinta un
 * nombre que no se guardó).
 */
export function GroupMembersScreen() {
  const navigation = useNavigation<MembersNav>();
  const route = useRoute<MembersRoute>();
  const { groupId, groupName } = route.params;
  const {
    role,
    groups,
    members,
    updateMemberRole,
    removeMember,
    loadGroupMembers,
    reloadGroups,
    eliminarGrupo,
    salirDelGrupo,
    toggleFavoriteGroup,
    editarGrupo,
    setRole,
  } = useMockStore();
  const { session } = useAuth();

  // Rol del usuario en ESTE grupo: el creador (groups.owner_id) siempre es owner;
  // si no lo es, manda su fila de miembro. Es el mismo criterio que aplica la
  // política RLS de group_members: solo owner y admin pueden dar de alta.
  const fallbackRole: 'owner' | 'admin' | 'member' =
    role === 'GROUP_OWNER' ? 'owner' : role === 'ADMIN' ? 'admin' : 'member';
  const viewerGroupRole = rolEnGrupo(groups, groupId, session?.user?.id, fallbackRole);
  const canAddMembers = viewerGroupRole === 'owner' || viewerGroupRole === 'admin';
  /** El creador es quien puede eliminar el grupo (la base no deja ni a un administrador). */
  const esCreador = viewerGroupRole === 'owner';

  useEffect(() => {
    // Refrescamos grupos (rol y creador) e integrantes al abrir la pantalla: el
    // permiso mostrado no debe depender de lo cargado al inicio de la sesión.
    reloadGroups();
    loadGroupMembers(groupId);
  }, [groupId, loadGroupMembers, reloadGroups]);

  /** El grupo tal como lo tiene el almacén: de ahí salen el nombre y la foto de verdad. */
  const grupo = useMemo(() => groups.find((g) => g.id === groupId), [groups, groupId]);
  const nombreDelGrupo = grupo?.name || groupName;

  /**
   * Silenciar (o volver a activar) los avisos del chat de este grupo.
   *
   * El estado sale de la membresía (`groups[].muted`, migración 0028) y, si el usuario lo cambia
   * aquí, manda lo que acaba de elegir. Si la base no lo acepta se deshace: nada de mentir con un
   * icono que dice una cosa y el servidor hace otra.
   */
  const [silenciado, setSilenciado] = useState<boolean | null>(null);

  useEffect(() => {
    if (silenciado === null && grupo) setSilenciado(grupo.muted === true);
  }, [grupo, silenciado]);

  const alternarSilencio = async () => {
    const nuevo = !(silenciado ?? false);
    setSilenciado(nuevo);
    const guardado = await silenciarGrupo(groupId, nuevo);
    if (!guardado) {
      setSilenciado(!nuevo);
      Alert.alert(
        'No se pudo cambiar',
        'No se pudo guardar el silencio del grupo. Comprueba tu conexión e inténtalo otra vez.'
      );
    }
  };

  // ---------------------------------------------------------------- nombre y foto (0044)
  /** El nombre que se está escribiendo en el aviso de cambio (null = el aviso está cerrado). */
  const [nombreEnEdicion, setNombreEnEdicion] = useState<string | null>(null);
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const guardarNombre = async () => {
    const limpio = (nombreEnEdicion ?? '').trim();
    if (!limpio || guardandoNombre) return;
    setGuardandoNombre(true);
    const guardado = await editarGrupo(groupId, { nombre: limpio });
    setGuardandoNombre(false);
    if (guardado) setNombreEnEdicion(null);
  };

  /** Cambiar la foto: cámara, galería o quitarla (mismo aviso que al crear el grupo). */
  const pedirYSubirFoto = async (origen: 'camara' | 'galeria') => {
    const elegida = origen === 'camara' ? await tomarFoto() : await elegirFoto();
    if (!elegida.ok) {
      if (!fueCancelado(elegida)) Alert.alert('No se pudo usar la foto', elegida.motivo);
      return;
    }
    const userId = session?.user?.id || '';
    if (!userId) {
      Alert.alert('No se pudo subir la foto', 'Vuelve a entrar a tu cuenta e inténtalo de nuevo.');
      return;
    }
    setSubiendoFoto(true);
    const subida = await subirFoto(elegida.valor, userId);
    if (!subida.ok) {
      setSubiendoFoto(false);
      Alert.alert('No se pudo subir la foto', subida.motivo);
      return;
    }
    const guardado = await editarGrupo(groupId, { avatarUrl: subida.valor });
    setSubiendoFoto(false);
    if (!guardado) return;
  };

  const pedirFoto = () => {
    Alert.alert('Foto del grupo', '¿De dónde sacamos la foto?', [
      { text: 'Tomar foto', onPress: () => pedirYSubirFoto('camara') },
      { text: 'Elegir de la galería', onPress: () => pedirYSubirFoto('galeria') },
      ...(grupo?.avatarUrl
        ? [
            {
              text: 'Quitar la foto',
              style: 'destructive' as const,
              onPress: () => void editarGrupo(groupId, { avatarUrl: null }),
            },
          ]
        : []),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };

  // ---------------------------------------------------------------- salir y eliminar
  /**
   * Eliminar el grupo (pedido del usuario, 20-09-2026).
   *
   * Solo su CREADOR: es lo que permite la política de `groups` (0002, «Owners manage groups»), así
   * que a un admin no se le enseña un botón que la base rechazaría. Se confirma una vez (es
   * irreversible) y se avisa de todo lo que se lleva por delante, porque la base lo borra en
   * cascada: integrantes, mensajes, lecturas y los servicios compartidos a ese grupo.
   */
  const handleEliminarGrupo = () => {
    Alert.alert(
      'Eliminar grupo',
      `¿Seguro que deseas eliminar «${nombreDelGrupo}»? También se borrarán sus integrantes y todos sus mensajes. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const borrado = await eliminarGrupo(groupId);
            // Si la base no lo borró, el aviso con el motivo ya se mostró: el grupo sigue ahí.
            if (!borrado) return;
            setRole('GROUP_OWNER');
            navigation.navigate('Main');
          },
        },
      ]
    );
  };

  /**
   * Salir del grupo (22-09-2026; y el CREADOR también desde el 23-09-2026).
   *
   * Cualquier integrante —o un administrador— puede irse: se borra SU fila de `group_members`
   * (migración 0043). Y el creador también puede irse: el usuario decidió el 23-09-2026 que «si el
   * propietario deja el grupo, la propiedad pasará al primer admin nombrado; si no hay admin nombrado,
   * pasará al primer integrante registrado» (lo hace la base, migración 0045). Si es el creador y está
   * SOLO, la base no lo deja: el grupo quedaría sin dueño y se le dice que lo elimine.
   */
  const handleSalirDelGrupo = () => {
    Alert.alert(
      'Salir del grupo',
      esCreador
        ? `¿Seguro que quieres salir de «${nombreDelGrupo}»? La propiedad pasará al administrador más antiguo y, si no hay ninguno, al primer integrante. Dejarás de verlo en Mis grupos.`
        : `¿Seguro que quieres salir de «${nombreDelGrupo}»? Dejarás de verlo en Mis grupos y no te llegarán sus avisos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            const salido = await salirDelGrupo(groupId);
            // Si la base no lo borró, el aviso con el motivo ya se mostró: se queda donde está.
            if (!salido) return;
            navigation.navigate('Main');
          },
        },
      ]
    );
  };

  // ---------------------------------------------------------------- integrantes
  // Orden pedido: propietario, luego los administradores que él asignó y al
  // final los integrantes. Dentro de cada rol, por nombre.
  const groupMembers = useMemo(() => sortMembersByRole(members[groupId] || []), [members, groupId]);

  // Integrantes cuya fila de `profiles` no se pudo leer (o que todavía no
  // completaron sus datos): sin esto la pantalla mostraba UUIDs y campos vacíos
  // sin decir por qué.
  const membersSinPerfil = groupMembers.filter((m) => m.profileFound === false).length;

  const handlePress = (member: GroupMember) => {
    navigation.navigate('ParticipantDetail', {
      groupId,
      memberId: member.id,
      memberName: displayName([member.name]),
      memberRole: member.role,
    });
  };

  const handleLongPress = (
    memberId: string,
    memberName: string,
    memberRole: 'owner' | 'admin' | 'member'
  ) => {
    // El creador del grupo no se elimina ni se degrada (la base lo impide): si lo
    // sabemos, se explica en vez de ofrecer una acción condenada a fallar.
    const grupoActual = groups.find((g) => g.id === groupId);
    if (grupoActual?.ownerId && grupoActual.ownerId === memberId) {
      Alert.alert(
        'Propietario del grupo',
        `${memberName} es el creador del grupo: no se puede eliminar ni cambiar de rol. Es quien puede volver a agregar integrantes.`
      );
      return;
    }

    if (viewerGroupRole === 'owner') {
      const isAdmin = memberRole === 'admin';
      Alert.alert(memberName, 'Selecciona una acción', [
        {
          text: isAdmin ? 'Desasignar Administrador' : 'Asignar Administrador',
          onPress: () => updateMemberRole(groupId, memberId, isAdmin ? 'member' : 'admin'),
        },
        {
          text: 'Eliminar Integrante',
          style: 'destructive',
          onPress: () => removeMember(groupId, memberId),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    } else if (viewerGroupRole === 'admin') {
      if (memberRole === 'owner') {
        Alert.alert('No permitido', 'No puedes eliminar al propietario.');
        return;
      }
      Alert.alert(memberName, 'Selecciona una acción', [
        {
          text: 'Eliminar Integrante',
          style: 'destructive',
          onPress: () => removeMember(groupId, memberId),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    }
  };

  const renderMember = ({ item }: { item: GroupMember }) => {
    const nombre = displayName([item.name]);
    const badge = groupRoleBadgeLabel(item.role);
    // Si no hay rol que anunciar y tampoco se pudo leer su perfil, se avisa en
    // el lugar de la etiqueta en vez de dejar la fila muda.
    const etiqueta = badge || (item.profileFound === false ? 'Sin datos' : '');
    return (
      <TouchableOpacity
        style={styles.memberPill}
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item.id, nombre, item.role)}
        activeOpacity={0.8}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialOf(nombre)}</Text>
        </View>
        <Text style={styles.memberName} numberOfLines={1}>
          {nombre}
        </Text>
        {etiqueta ? (
          <Text
            style={[styles.memberRole, badge ? styles.memberRoleStrong : styles.memberRoleMuted]}
            numberOfLines={1}
          >
            {etiqueta}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  /** Un botón de la botonera (icono arriba, texto debajo), como en la referencia del usuario. */
  const boton = (
    icono: string,
    etiqueta: string,
    alTocar: () => void,
    opciones: { rojo?: boolean; activo?: boolean } = {}
  ) => (
    <TouchableOpacity
      style={[styles.boton, opciones.activo && styles.botonActivo]}
      onPress={alTocar}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
    >
      <View style={[styles.botonIcono, opciones.rojo && styles.botonIconoRojo]}>
        <MaterialCommunityIcons
          name={icono as never}
          size={22}
          color={opciones.rojo ? ROJO_ACCION : OSCURO}
        />
      </View>
      <Text
        style={[styles.botonTexto, opciones.rojo && styles.botonTextoRojo]}
        numberOfLines={1}
      >
        {etiqueta}
      </Text>
    </TouchableOpacity>
  );

  const fijado = grupo?.favorite === true;
  const enSilencio = silenciado ?? grupo?.muted === true;

  return (
    <SafeAreaView style={styles.container}>
      {/* Cabecera: flecha, nombre y el lápiz para cambiarlo (creador o administrador). */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IconoDeAtras />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {nombreDelGrupo}
        </Text>
        {canAddMembers ? (
          <TouchableOpacity
            onPress={() => setNombreEnEdicion(nombreDelGrupo)}
            style={styles.headerBtn}
            accessibilityLabel="Cambiar el nombre del grupo"
          >
            <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      <FlatList
        data={groupMembers}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {/* La foto del grupo: un círculo grande con el lápiz encima (si se puede editar). */}
            <View style={styles.zonaDelAvatar}>
              <TouchableOpacity
                onPress={canAddMembers ? pedirFoto : undefined}
                disabled={!canAddMembers || subiendoFoto}
                accessibilityLabel={canAddMembers ? 'Cambiar la foto del grupo' : 'Foto del grupo'}
                activeOpacity={canAddMembers ? 0.8 : 1}
              >
                {grupo?.avatarUrl ? (
                  <Image source={{ uri: grupo.avatarUrl }} style={styles.avatarGrande} />
                ) : (
                  <View style={styles.avatarGrande}>
                    <Text style={styles.avatarGrandeTexto}>{nombreDelGrupo.charAt(0)}</Text>
                  </View>
                )}
                {subiendoFoto && (
                  <View style={[styles.lapizDelAvatar, styles.lapizDelAvatarCargando]}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
                {!subiendoFoto && canAddMembers && (
                  <View style={styles.lapizDelAvatar}>
                    <MaterialCommunityIcons name="pencil" size={16} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* La botonera: fijar, silencio, salir y eliminar. Solo lo que cada uno puede de verdad. */}
            <View style={styles.botonera}>
              {boton(
                fijado ? 'pin' : 'pin-outline',
                fijado ? 'desfijar' : 'fijar',
                () => toggleFavoriteGroup(groupId),
                { activo: fijado }
              )}
              {boton(
                enSilencio ? 'volume-high' : 'volume-off',
                enSilencio ? 'sonido' : 'silencio',
                () => void alternarSilencio(),
                { activo: enSilencio }
              )}
              {/* Salir: desde el 23-09-2026 lo tiene TODO EL MUNDO, también el creador (al salir, la
                  propiedad se hereda en la base). «Eliminar» sigue siendo solo del creador. */}
              {boton('exit-to-app', 'salir', handleSalirDelGrupo, { rojo: true })}
              {esCreador && boton('delete', 'Eliminar', handleEliminarGrupo, { rojo: true })}
            </View>

            <View style={styles.separador} />
            <Text style={styles.tituloIntegrantes}>
              {groupMembers.length === 1
                ? '1 integrante'
                : `${groupMembers.length} integrantes`}
            </Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No hay integrantes</Text>}
        ListFooterComponent={
          membersSinPerfil > 0 ? (
            <Text style={styles.warnText}>
              {membersSinPerfil === 1
                ? '1 integrante todavía no tiene nombre ni teléfono en su perfil.'
                : `${membersSinPerfil} integrantes todavía no tienen nombre ni teléfono en su perfil.`}{' '}
              Si sus datos sí están guardados, falta aplicar la migración 0005 en Supabase
              (funciones group_member_profiles / public_profile).
            </Text>
          ) : null
        }
      />

      {/* FAB: solo para owner/admin, igual que la política RLS de group_members */}
      {canAddMembers ? (
        <Fab
          etiqueta="Agregar integrante"
          onPress={() => navigation.navigate('AddParticipant', { groupId, groupName: nombreDelGrupo })}
        />
      ) : (
        <Text style={styles.memberNote}>
          Solo el propietario o un administrador del grupo pueden agregar integrantes
        </Text>
      )}

      {/* Cambiar el nombre del grupo (0044). Es un aviso propio porque en web `Alert.prompt` no
          existe: un modal con su campo funciona igual en el teléfono y en el navegador. */}
      <Modal
        visible={nombreEnEdicion !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setNombreEnEdicion(null)}
      >
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={styles.modalTitulo}>Nombre del grupo</Text>
            <TextInput
              style={styles.modalInput}
              value={nombreEnEdicion ?? ''}
              onChangeText={setNombreEnEdicion}
              autoFocus
              maxLength={60}
              placeholder="Nombre del grupo"
              placeholderTextColor="#999"
              onSubmitEditing={() => void guardarNombre()}
            />
            <View style={styles.modalBotones}>
              <TouchableOpacity
                style={styles.modalBoton}
                onPress={() => setNombreEnEdicion(null)}
                accessibilityLabel="Cancelar"
              >
                <Text style={styles.modalBotonTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBoton, styles.modalBotonPrincipal]}
                onPress={() => void guardarNombre()}
                disabled={guardandoNombre || (nombreEnEdicion ?? '').trim() === ''}
                accessibilityLabel="Guardar el nombre"
              >
                <Text style={[styles.modalBotonTexto, styles.modalBotonTextoPrincipal]}>
                  {guardandoNombre ? 'Guardando...' : 'Guardar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  backBtn: {
    padding: 4,
  },
  backArrow: {
    color: '#fff',
    fontSize: 24,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  /** El lápiz de la cabecera (cambiar el nombre). */
  headerBtn: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** El círculo grande con la foto del grupo. */
  zonaDelAvatar: {
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 18,
  },
  avatarGrande: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: AVATAR_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarGrandeTexto: { color: '#fff', fontSize: 34, fontWeight: 'bold' },
  /** El lápiz sobre el círculo, en su esquina. */
  lapizDelAvatar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  lapizDelAvatarCargando: { backgroundColor: DARK_BG },
  /** La botonera: los botones repartidos y con el mismo ancho. */
  botonera: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  boton: {
    alignItems: 'center',
    marginHorizontal: 6,
    marginBottom: 8,
    minWidth: 74,
  },
  botonActivo: {},
  botonIcono: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: GRIS_BOTON,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonIconoRojo: { backgroundColor: '#FDEDED' },
  botonTexto: {
    marginTop: 6,
    fontSize: 12,
    color: OSCURO,
    fontWeight: '600',
  },
  botonTextoRojo: { color: ROJO_ACCION },
  separador: {
    height: 1,
    backgroundColor: '#EDEDED',
    marginTop: 10,
    marginBottom: 4,
  },
  tituloIntegrantes: {
    marginTop: 10,
    marginBottom: 2,
    fontSize: 13,
    fontWeight: '700',
    color: TEXTO_SUAVE,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  memberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 23,
    paddingVertical: 13,
    paddingHorizontal: 18,
    marginVertical: 8,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AVATAR_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberName: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  // Nomenclatura de la referencia: a la derecha, en azul.
  memberRole: {
    marginLeft: 8,
    fontSize: 15,
    color: BLUE,
  },
  memberRoleStrong: {
    fontWeight: '600',
  },
  memberRoleMuted: {
    color: '#999',
  },
  warnText: {
    marginTop: 18,
    color: '#C2333F',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
  memberNote: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    textAlign: 'center',
    color: '#888',
    fontSize: 13,
    paddingHorizontal: 24,
  },
  modalFondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  modalCaja: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitulo: { fontSize: 17, fontWeight: 'bold', color: '#111', marginBottom: 14 },
  modalInput: {
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
  },
  modalBotones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 18,
  },
  modalBoton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginLeft: 8,
  },
  modalBotonPrincipal: { backgroundColor: BLUE },
  modalBotonTexto: { fontSize: 15, fontWeight: '600', color: '#444' },
  modalBotonTextoPrincipal: { color: '#fff' },
});
