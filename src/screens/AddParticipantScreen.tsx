import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';

import { Icono, ICONO_BUSCAR } from '../components/Icono';
import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import { countVisibleProfiles, searchProfiles } from '../lib/database';
import { describeError, textoDeErrorParaElUsuario } from '../lib/errors';
import { initialOf } from '../lib/names';
import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';

type AddNav = StackNavigationProp<RootStackParamList, 'AddParticipant'>;
type AddRoute = RouteProp<RootStackParamList, 'AddParticipant'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

interface SearchableContact {
  id: string;
  name: string;
  phone: string;
  role: string;
}

/** Texto del error con el detalle que devuelve Supabase (code/details/hint). */
function detalleDeError(err: unknown): string {
  const partes: string[] = [describeError(err)];
  if (err && typeof err === 'object') {
    (['message', 'code', 'details', 'hint'] as const).forEach((clave) => {
      const valor = (err as Record<string, unknown>)[clave];
      if (typeof valor === 'string' && valor) partes.push(`${clave}: ${valor}`);
    });
  }
  return partes.join(' · ');
}

function mensajeDeAlta(err: unknown): string {
  const detalle = detalleDeError(err);
  const minusculas = detalle.toLowerCase();
  if (
    minusculas.includes('duplicate key') ||
    minusculas.includes('23505') ||
    minusculas.includes('already exists')
  ) {
    return 'Ese usuario ya es integrante del grupo.';
  }
  if (
    minusculas.includes('row-level security') ||
    minusculas.includes('42501') ||
    minusculas.includes('permission denied')
  ) {
    return (
      'Sin permiso para agregar integrantes en este grupo: tu fila en group_members no es owner/admin. ' +
      'Pide al propietario que te asigne Administrador (mantener pulsado tu nombre en la lista) ' +
      'o aplica supabase/migrations/0004_group_rls_recursion_fix.sql para que el propietario del grupo ' +
      `pueda agregar aunque su fila de miembro falte. · ${detalle}`
    );
  }
  return `No se pudo añadir al integrante: ${detalle}`;
}

export function AddParticipantScreen() {
  const navigation = useNavigation<AddNav>();
  const route = useRoute<AddRoute>();
  /**
   * `paraGrupoNuevo` (23-09-2026): el «+» de Mis grupos pide PRIMERO los integrantes y después el
   * nombre, como WhatsApp. En ese modo esta pantalla no toca la base: solo elige personas y se las
   * pasa a «Nuevo grupo».
   */
  const { groupId, groupName, paraGrupoNuevo } = route.params;
  const { members, addMember } = useMockStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchableContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  // Se guardan los CONTACTOS elegidos, no solo sus ids: `results` se reemplaza
  // en cada búsqueda, así que buscar un segundo número borraba al primero de la
  // lista y al pulsar "Añadir (2)" solo se agregaba el que seguía a la vista.
  const [selected, setSelected] = useState<Record<string, SearchableContact>>({});
  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedList.length;

  const existingMemberIds = useMemo(
    // Al crear un grupo todavía no hay integrantes: nadie sale como «ya es integrante».
    () => new Set(paraGrupoNuevo || !groupId ? [] : (members[groupId] || []).map((m) => m.id)),
    [members, groupId, paraGrupoNuevo]
  );

  useEffect(() => {
    let mounted = true;
    const text = query.trim();
    if (text.length < 3) {
      setResults([]);
      setSearchError(null);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      searchProfiles(text)
        .then(async (profiles) => {
          if (!mounted) return;
          setSearchError(null);
          setResults(
            profiles.map((p) => ({
              id: p.id,
              name: p.full_name || p.phone || 'Sin nombre',
              phone: p.phone || '',
              role: p.role || '',
            }))
          );

          if (profiles.length > 0) {
            setDiagnostic(null);
            return;
          }

          // Sin resultados: distingue "ese usuario no existe" de "RLS solo me
          // deja ver mi propio perfil" (la causa más común).
          try {
            const visibles = await countVisibleProfiles();
            if (!mounted) return;
            setDiagnostic(
              visibles <= 1
                ? 'Supabase solo te devuelve tu propio perfil: aplica la migración 0003 (supabase/migrations/0003_search_profiles.sql) en Supabase Studio > SQL Editor, o la política RLS de lectura de profiles de la 0002. Comprueba también que el otro usuario tenga fila en profiles.'
                : null
            );
          } catch {
            if (mounted) setDiagnostic(null);
          }
        })
        .catch((err) => {
          if (!mounted) return;
          // eslint-disable-next-line no-console
          console.error('[AddParticipant] searchProfiles error:', err);
          setSearchError(textoDeErrorParaElUsuario(err));
          setResults([]);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }, 400);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [query]);

  const toggleSelection = (contact: SearchableContact) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[contact.id]) delete next[contact.id];
      else next[contact.id] = contact;
      return next;
    });
  };

  const handleAdd = async () => {
    if (adding || selectedCount === 0) return;

    // Camino del grupo NUEVO: no se escribe nada todavía, se pasa a ponerle nombre y foto.
    if (paraGrupoNuevo) {
      navigation.navigate('CreateGroup', {
        integrantes: selectedList.map((contacto) => ({ id: contacto.id, name: contacto.name })),
      });
      return;
    }
    setAdding(true);
    setAddError(null);

    const added: string[] = [];
    const addedIds: string[] = [];
    const fallidos: string[] = [];
    const yaEstaban: string[] = [];

    try {
      for (const contact of selectedList) {
        if (existingMemberIds.has(contact.id)) {
          yaEstaban.push(contact.name || contact.phone);
          continue;
        }
        try {
          await addMember({
            id: contact.id,
            groupId,
            name: contact.name,
            role: 'member',
          });
          added.push(contact.name || contact.phone);
          addedIds.push(contact.id);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[AddParticipant] addMember error:', err);
          // Un contacto que falla no debe abortar los siguientes.
          fallidos.push(`${contact.name || contact.phone}: ${mensajeDeAlta(err)}`);
        }
      }

      // Los que sí entraron salen de la selección: si algo falló, el botón queda
      // con los que faltan en lugar de repetir todo.
      setSelected((prev) => {
        const next = { ...prev };
        addedIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });

      if (fallidos.length > 0) {
        setAddError(
          `${added.length > 0 ? `Se agregaron ${added.length}: ${added.join(', ')}. ` : ''}` +
            `No se pudieron agregar ${fallidos.length}:\n${fallidos.join('\n')}`
        );
        return;
      }

      if (added.length === 0) {
        setAddError('Esos usuarios ya son integrantes del grupo.');
        return;
      }

      Alert.alert(
        added.length === 1 ? 'Integrante añadido' : 'Integrantes añadidos',
        `${added.join('\n')}${yaEstaban.length > 0 ? `\n(Ya estaba en el grupo: ${yaEstaban.join(', ')})` : ''}`
      );
      navigation.goBack();
    } finally {
      setAdding(false);
    }
  };

  const renderContact = ({ item }: { item: SearchableContact }) => {
    const estaSeleccionado = Boolean(selected[item.id]);
    const alreadyMember = existingMemberIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.contactPill, alreadyMember && styles.disabledPill]}
        onPress={() => !alreadyMember && toggleSelection(item)}
        activeOpacity={alreadyMember ? 1 : 0.7}
      >
        <View style={styles.leftContent}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialOf(item.name)}</Text>
          </View>
          <View>
            <Text style={[styles.contactName, alreadyMember && styles.disabledText]}>
              {item.name}
            </Text>
            <Text style={styles.phoneText}>{item.phone}</Text>
            {alreadyMember && <Text style={styles.alreadyText}>Ya es integrante</Text>}
          </View>
        </View>

        {!alreadyMember && (
          <View style={[styles.selector, estaSeleccionado && styles.selectorActive]}>
            {estaSeleccionado && <Text style={styles.check}>✓</Text>}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IconoDeAtras />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {paraGrupoNuevo ? 'Elegir integrantes' : 'Añadir participante'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchPill}>
          <Icono fuente={ICONO_BUSCAR} tamano={20} color="#666" estilo={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre o teléfono"
            placeholderTextColor="#999"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {loading && <ActivityIndicator style={styles.loader} size="small" color={BLUE} />}

      {/* Contact list */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          searchError ? (
            <Text style={styles.errorText}>No se pudo buscar: {searchError}</Text>
          ) : diagnostic ? (
            <Text style={styles.errorText}>{diagnostic}</Text>
          ) : query.length >= 3 && !loading ? (
            <Text style={styles.emptyText}>
              No se encontraron usuarios con ese nombre ni teléfono
            </Text>
          ) : (
            <Text style={styles.emptyText}>
              Escribe al menos 3 caracteres del nombre o del teléfono
            </Text>
          )
        }
      />

      {/* Zona inferior: selección pendiente + error + botón, siempre visible */}
      <View style={styles.bottomArea}>
        {/* Error en pantalla: en web Alert.alert no muestra nada */}
        {!!addError && <Text style={styles.errorBox}>{addError}</Text>}

        {/* Selección pendiente: sin esto, al buscar otro número el botón decía
            "Añadir (2)" sin que se viera quién era el segundo. */}
        {selectedCount > 0 && (
          <View style={styles.selectedBar}>
            <Text style={styles.selectedTitle}>
              {selectedCount === 1 ? '1 seleccionado' : `${selectedCount} seleccionados`}
            </Text>
            <View style={styles.chipsRow}>
              {selectedList.map((contacto) => (
                <TouchableOpacity
                  key={contacto.id}
                  style={styles.chip}
                  onPress={() => toggleSelection(contacto)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipText} numberOfLines={1}>
                    {contacto.name || contacto.phone}
                  </Text>
                  <Text style={styles.chipX}>×</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {selectedCount > 0 && (
          <TouchableOpacity
            style={[styles.addButton, adding && styles.addButtonDisabled]}
            onPress={handleAdd}
            disabled={adding}
          >
            <Text style={styles.addButtonText}>
              {paraGrupoNuevo
                ? `Siguiente (${selectedCount})`
                : adding
                  ? 'Añadiendo...'
                  : `Añadir (${selectedCount})${selectedCount > 1 ? ' integrantes' : ''}`}
            </Text>
          </TouchableOpacity>
        )}
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
  },
  headerSpacer: {
    width: 28,
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#fff',
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingVertical: 4,
    // Sin el recuadro de foco del navegador (misma regla que la barra del chat).
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
  loader: {
    marginTop: 12,
  },
  listFlex: {
    flex: 1,
  },
  list: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 16,
  },
  bottomArea: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 4,
    backgroundColor: '#fff',
  },
  selectedBar: {
    marginBottom: 12,
  },
  selectedTitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF0FA',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: '100%',
  },
  chipText: {
    color: '#3F51B5',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  chipX: {
    color: '#3F51B5',
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F2F2F2',
    borderRadius: 30,
    padding: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  disabledPill: {
    opacity: 0.6,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
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
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  phoneText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  disabledText: {
    color: '#777',
  },
  alreadyText: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
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
  errorText: {
    textAlign: 'center',
    color: '#C2333F',
    marginTop: 40,
    paddingHorizontal: 16,
  },
  errorBox: {
    backgroundColor: '#FDECEA',
    borderColor: '#F5C6C2',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    color: '#B3261E',
    fontSize: 13,
  },
  addButton: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
