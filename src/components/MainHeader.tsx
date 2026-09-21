import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

import { Icono, ICONO_AJUSTES } from './Icono';
import { textoDelBoton } from '../lib/novedadesDelInicio';
import { RootStackParamList } from '../navigation/RootNavigator';

type HeaderNav = StackNavigationProp<RootStackParamList, 'Main'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

export type MainTab = 'Conductor' | 'Proveedor' | 'Mis Grupos';

const TABS: MainTab[] = ['Conductor', 'Proveedor', 'Mis Grupos'];

/**
 * Cómo se llama cada pestaña EN PANTALLA. El id interno no se toca (la navegación y las
 * pantallas comparan con 'Mis Grupos'); lo que cambió es el rótulo, que el usuario pidió
 * en minúscula: "Mis grupos" (18-09-2026).
 */
const ETIQUETA_DEL_TAB: Record<MainTab, string> = {
  Conductor: 'Conductor',
  Proveedor: 'Proveedor',
  'Mis Grupos': 'Mis grupos',
};

interface MainHeaderProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  /**
   * Novedades sin ver de cada apartado (20-09-2026): van DENTRO del botón, al lado del texto
   * («Conductor 12», «Mis grupos 14») en vez del globo rojo de la esquina. Cada uno es la suma de
   * sus sub botones; «Mis grupos» es la suma de los mensajes sin leer de todos los grupos.
   */
  contadores?: { conductor: number; proveedor: number; misGrupos: number };
}

const CLAVE_DE_CONTADOR: Record<MainTab, keyof NonNullable<MainHeaderProps['contadores']>> = {
  Conductor: 'conductor',
  Proveedor: 'proveedor',
  'Mis Grupos': 'misGrupos',
};

export function MainHeader({ activeTab, onTabChange, contadores }: MainHeaderProps) {
  const navigation = useNavigation<HeaderNav>();

  return (
    <SafeAreaView style={styles.wrapper}>
      {/* Header oscuro */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>WhatsRemisse</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Cuenta"
          >
            {/* El avatar (18-09-2026): el usuario lo quería "a la altura del logo de
                WhatsRemisse y un poco más ancho". Medido en la app: el logo tiene 15 px
                de tinta de alto y el avatar tenía 22 (más alto que el logo). Ahora mide
                15 de alto —clavado al logo— y se estira a 15 de ancho, o sea un 30 % más
                ancho que su proporción natural (11,5), que era lo que se veía estrecho. */}
            {/* El `translateY` de -1,6 px alinea las dos tintas: el texto se asienta
                dejando el hueco del descendente debajo, así que su tinta queda 1,6 px por
                encima del centro de su caja y el avatar quedaba algo bajo (medido). */}
            <Icono
              fuente={ICONO_AJUSTES}
              tamano={15}
              estirar
              estilo={{ transform: [{ translateY: -1.6 }] }}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Role tabs */}
      <View style={styles.roleBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.roleTab, activeTab === tab && styles.roleTabActive]}
            onPress={() => onTabChange(tab)}
          >
            <Text style={[styles.roleTabText, activeTab === tab && styles.roleTabTextActive]}>
              {/* El botón se ensancha solo con el número; la separación entre botones (el
                  `marginRight` de `roleTab`) no se toca. */}
              {textoDelBoton(ETIQUETA_DEL_TAB[tab], contadores?.[CLAVE_DE_CONTADOR[tab]] ?? 0)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: DARK_BG,
    /**
     * Sin el hueco inferior (18-09-2026): la franja negra es de ARRIBA, así que no tiene por
     * qué reservar el espacio del indicador de inicio. En el iPhone medía 185 px de alto
     * (59 del notch + 49 + 43 de la barra + 34 que sobraban abajo).
     */
    paddingBottom: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: DARK_BG,
    paddingHorizontal: 16,
    // Más aire arriba: separa el logo y el avatar del borde del teléfono (pedido del usuario,
    // 19-09-2026). Ojo: en el iPhone instalado la franja del notch ocupa parte de ese hueco.
    paddingTop: 26,
    // Y más aire abajo: separa el logo de la fila de botones (Conductor/Proveedor/Mis grupos).
    paddingBottom: 26,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerIcons: {
    flexDirection: 'row',
  },
  iconBtn: {
    marginLeft: 16,
    padding: 4,
  },
  icon: {
    fontSize: 20,
    color: '#fff',
  },
  roleBar: {
    flexDirection: 'row',
    backgroundColor: DARK_BG,
    paddingHorizontal: 16,
    paddingBottom: 14,
    // Con el número dentro, el botón se ensancha: si los tres no caben en una línea (números
    // grandes y pantalla estrecha), pasan a la siguiente en vez de quedar cortados. La separación
    // entre botones es la misma.
    flexWrap: 'wrap',
  },
  roleTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  roleTabActive: {
    backgroundColor: BLUE,
  },
  roleTabText: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
  },
  roleTabTextActive: {
    color: '#fff',
  },
});
