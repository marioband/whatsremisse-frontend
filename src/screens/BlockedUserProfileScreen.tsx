import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';

import { Alert } from '../lib/alert';
import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type ProfileNav = StackNavigationProp<RootStackParamList, 'BlockedUserProfile'>;
type ProfileRoute = RouteProp<RootStackParamList, 'BlockedUserProfile'>;

const DARK_BG = '#2D2D2D';

export function BlockedUserProfileScreen() {
  const navigation = useNavigation<ProfileNav>();
  const route = useRoute<ProfileRoute>();
  const { user } = route.params;

  const handleUnblock = () => {
    Alert.alert('Desbloquear usuario', `¿Estás seguro de desbloquear a ${user.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desbloquear',
        onPress: () => navigation.goBack(),
      },
    ]);
  };

  const renderRow = (label: string, value: string) => (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        editable={false}
        placeholder="-"
        placeholderTextColor="#999"
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IconoDeAtras />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {user.name}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Avatar */}
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={() => Alert.alert('Avatar', 'Selección de avatar simulada.')}
        >
          <View style={styles.avatar}>
            <MaterialCommunityIcons name="camera" size={48} color="#9E9E9E" />
          </View>
          <Text style={styles.changePhotoText}>Cambiar foto de perfil</Text>
        </TouchableOpacity>

        {/* Driver data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del conductor</Text>
          {renderRow('Nombres', user.firstName)}
          {renderRow('Apellidos', user.lastName)}
          {renderRow('DNI', user.dni)}
          {renderRow('Número Celular', user.phone)}
        </View>

        {/* Vehicle data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del Vehículo</Text>
          {renderRow('Marca', user.brand)}
          {renderRow('Modelo', user.model)}
          {renderRow('Año', user.year)}
          {renderRow('Color', user.color)}
          {renderRow('Placa', user.plate)}
        </View>

        <View style={styles.spacer} />
      </ScrollView>

      {/* Unblock button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.unblockBtn} onPress={handleUnblock}>
          <Text style={styles.unblockText}>Desbloquear</Text>
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
    paddingBottom: 14,
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
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerSpacer: {
    width: 36,
  },
  body: {
    padding: 20,
    paddingBottom: 40,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarIcon: {
    fontSize: 48,
  },
  changePhotoText: {
    fontSize: 14,
    color: '#333',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
    width: '30%',
  },
  input: {
    width: '65%',
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  spacer: {
    height: 20,
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
  },
  unblockBtn: {
    backgroundColor: DARK_BG,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  unblockText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
