import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { Alert } from '../lib/alert';
import { bloquearCuenta, cargarMisBloqueos, searchProfiles, SearchableProfile } from '../lib/database';
import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';
import { TEXTO_TENUE } from '../lib/colors';

type ElegirNav = StackNavigationProp<RootStackParamList, 'ElegirBloqueo'>;
type ElegirRoute = RouteProp<RootStackParamList, 'ElegirBloqueo'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

/**
 * Bloquear a una cuenta (0055): se busca por nombre o teléfono (el mismo buscador de
 * «agregar integrante») y se bloquea. El bloqueo se guarda en la cuenta: entre las dos
 * cuentas no se cruzan las alertas de servicio (la base lo hace cumplir).
 */
export function ElegirBloqueoScreen() {
  const navigation = useNavigation<ElegirNav>();
  const route = useRoute<ElegirRoute>();
  const { vista } = route.params;
  const { session } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchableProfile[]>([]);
  const [cargando, setCargando] = useState(false);
  const [bloqueados, setBloqueados] = useState<Set<string>>(new Set());
  const [bloqueando, setBloqueando] = useState<string | null>(null);

  // Quiénes ya están bloqueados: se marcan en la lista (no se pueden volver a bloquear).
  useEffect(() => {
    cargarMisBloqueos()
      .then((lista) => setBloqueados(new Set(lista.map((b) => b.id))))
      .catch(() => undefined);
  }, []);

  // Búsqueda con la misma tolerancia del buscador de integrantes (3 letras mínimo).
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setResults([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    const timer = setTimeout(() => {
      searchProfiles(text)
        .then((perfiles) =>
          setResults(perfiles.filter((p) => p.id !== session?.user?.id))
        )
        .catch(() => setResults([]))
        .finally(() => setCargando(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [query, session?.user?.id]);

  const bloquear = (perfil: SearchableProfile) => {
    const nombre = perfil.full_name || perfil.phone || 'esta cuenta';
    Alert.alert(
      vista === 'CONDUCTOR' ? 'Bloquear conductor' : 'Bloquear proveedor',
      `¿Seguro que quieres bloquear a ${nombre}? Entre ustedes no se verán las alertas de servicio.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: () => {
            setBloqueando(perfil.id);
            bloquearCuenta(perfil.id, vista)
              .then(() => {
                setBloqueados((prev) => new Set([...prev, perfil.id]));
                Alert.alert(
                  'Bloqueado',
                  `Listo. ${nombre === 'esta cuenta' ? 'Esa cuenta' : nombre} ya no comparte alertas contigo.`
                );
              })
              .catch((err) => {
                // eslint-disable-next-line no-console
                console.warn('[Bloqueados] no se pudo bloquear:', err);
                Alert.alert('No se pudo bloquear', 'Inténtalo de nuevo en un momento.');
              })
              .finally(() => setBloqueando(null));
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: SearchableProfile }) => {
    const yaEsta = bloqueados.has(item.id);
    const nombre = item.full_name || item.phone || 'Cuenta sin nombre';
    return (
      <TouchableOpacity
        style={styles.fila}
        onPress={() => !yaEsta && !bloqueando && bloquear(item)}
        disabled={yaEsta || !!bloqueando}
        activeOpacity={0.8}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{nombre.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.textos}>
          <Text style={styles.nombre} numberOfLines={1}>
            {nombre}
          </Text>
          {!!item.phone && <Text style={styles.telefono}>{item.phone}</Text>}
        </View>
        {yaEsta ? (
          <Text style={styles.yaBloqueado}>Ya bloqueado</Text>
        ) : (
          <Text style={styles.accion}>{bloqueando === item.id ? 'Bloqueando…' : 'Bloquear'}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const corto = query.trim().length < 3;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IconoDeAtras />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {vista === 'CONDUCTOR' ? 'Bloquear conductor' : 'Bloquear proveedor'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Buscador */}
      <View style={styles.buscador}>
        <TextInput
          style={styles.campo}
          value={query}
          onChangeText={setQuery}
          placeholder="Nombre o número de teléfono"
          placeholderTextColor={TEXTO_TENUE}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {cargando ? (
        <ActivityIndicator style={styles.cargando} color={TEXTO_TENUE} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.lista}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.aviso}>
              {corto
                ? 'Escribe al menos 3 letras del nombre o del teléfono.'
                : 'No se encontró a nadie con eso.'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    minHeight: 102,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerSpacer: { width: 36 },
  buscador: { paddingHorizontal: 16, paddingTop: 16 },
  campo: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111111',
  },
  cargando: { marginTop: 32 },
  lista: { padding: 16, paddingBottom: 60 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  textos: { flex: 1 },
  nombre: { fontSize: 16, fontWeight: '600', color: '#111' },
  telefono: { fontSize: 13, color: TEXTO_TENUE, marginTop: 2 },
  accion: { fontSize: 13, fontWeight: '600', color: BLUE },
  yaBloqueado: { fontSize: 13, fontWeight: '600', color: TEXTO_TENUE },
  aviso: { textAlign: 'center', color: TEXTO_TENUE, marginTop: 32, fontSize: 14 },
});
