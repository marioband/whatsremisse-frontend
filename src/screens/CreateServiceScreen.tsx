import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ServiceAlert } from '../types';

type CreateNav = StackNavigationProp<
  RootStackParamList,
  'CreateService' | 'SelectGroupsForService'
>;
type CreateRoute = RouteProp<RootStackParamList, 'CreateService'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';
const LIGHT_BG = '#F0F2F5';

const PAYMENT_TYPES = ['BCP', 'Yape', 'Plin', 'Efectivo', 'Otro'];
const PAYMENT_DATES = ['Al término', 'Durante el día', 'Mañana', 'Escribir'];
const UNIT_TYPES = ['Todos', 'Auto compacto', 'Auto', 'Camioneta', 'Camioneta 3 filas'];

export function CreateServiceScreen() {
  const navigation = useNavigation<CreateNav>();
  const route = useRoute<CreateRoute>();
  const { updateService } = useMockStore();
  const { session, profile } = useAuth();
  const editingService = route.params?.service;
  const isEditing = !!editingService;

  const getInitialDateTime = () => {
    if (editingService?.scheduled_at) {
      const d = new Date(editingService.scheduled_at);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return { date: `${day}/${month}`, time: `${hours}:${minutes}` };
    }
    return { date: '', time: '' };
  };

  const initialDateTime = getInitialDateTime();

  const [origin, setOrigin] = useState(editingService?.origin_address || '');
  const [destinations, setDestinations] = useState<string[]>(
    editingService?.origin_address ? [editingService.destination_address] : ['']
  );
  const [fare, setFare] = useState(editingService ? String(editingService.fare) : '');
  const [paymentType, setPaymentType] = useState(editingService?.payment_method || 'BCP');
  const [otherPayment, setOtherPayment] = useState('');
  const [paymentDate, setPaymentDate] = useState(editingService?.payment_term || 'Al término');
  const [customPaymentDate, setCustomPaymentDate] = useState('');
  const [unitType, setUnitType] = useState(editingService?.vehicle_type || 'Todos');
  const [observation, setObservation] = useState(editingService?.observations?.join(', ') || '');
  const [serviceDate, setServiceDate] = useState(initialDateTime.date);
  const [serviceTime, setServiceTime] = useState(initialDateTime.time);

  const addDestination = () => {
    setDestinations([...destinations, '']);
  };

  const updateDestination = (index: number, value: string) => {
    const updated = [...destinations];
    updated[index] = value;
    setDestinations(updated);
  };

  const removeDestination = (index: number) => {
    if (destinations.length <= 1) return;
    const updated = destinations.filter((_, i) => i !== index);
    setDestinations(updated);
  };

  const handleSubmit = () => {
    if (!origin || !destinations[0] || !fare || !serviceDate || !serviceTime) {
      Alert.alert('Campos incompletos', 'Completa origen, destino, tarifa, fecha y hora.');
      return;
    }

    const mainDestination = destinations[destinations.length - 1];
    const intermediateStops = destinations.slice(0, -1).filter(Boolean);

    const finalPaymentType = paymentType === 'Otro' && otherPayment ? otherPayment : paymentType;
    const finalPaymentDate =
      paymentDate === 'Escribir' && customPaymentDate ? customPaymentDate : paymentDate;

    const observationsList = [
      observation,
      intermediateStops.length > 0 ? `Paradas: ${intermediateStops.join(', ')}` : '',
    ].filter(Boolean);

    const parseScheduledDate = (dateStr: string, timeStr: string): string => {
      const [day, month] = dateStr.split('/').map((v) => parseInt(v, 10));
      const [hours, minutes] = timeStr.split(':').map((v) => parseInt(v, 10));
      const now = new Date();
      const scheduled = new Date(
        now.getFullYear(),
        (month || 1) - 1,
        day || 1,
        hours || 0,
        minutes || 0
      );
      return scheduled.toISOString();
    };

    const dispatchType = `${serviceDate} ${serviceTime}hrs`;
    const scheduledAt = parseScheduledDate(serviceDate, serviceTime);

    if (isEditing && editingService) {
      const updatedService: ServiceAlert = {
        ...editingService,
        title: `${origin} -> ${mainDestination}`,
        description: `Unidad: ${unitType}${observation ? ` • ${observation}` : ''}`,
        origin_address: origin,
        destination_address: mainDestination,
        vehicle_requirements: { vehicle_type: unitType },
        fare: parseFloat(fare) || 0,
        status: 'STATUS_OPEN',
        assigned_driver_id: null,
        updated_at: new Date().toISOString(),
        dispatch_type: dispatchType,
        scheduled_at: scheduledAt,
        observations: observationsList.length > 0 ? observationsList : undefined,
        payment_term: finalPaymentDate,
        payment_method: finalPaymentType,
      };
      updateService(updatedService);
      Alert.alert('Servicio actualizado', 'El servicio fue reprogramado correctamente.');
      navigation.goBack();
      return;
    }

    const userId = session?.user?.id;
    if (!userId) {
      Alert.alert('Sesión requerida', 'Debes iniciar sesión para publicar un servicio.');
      return;
    }
    const providerName = profile?.full_name || 'Proveedor';

    const newService: ServiceAlert = {
      id: `service-${Date.now()}`,
      provider_id: userId,
      group_id: '',
      title: `${origin} -> ${mainDestination}`,
      description: `Unidad: ${unitType}${observation ? ` • ${observation}` : ''}`,
      origin_address: origin,
      origin_lat: 0,
      origin_lng: 0,
      destination_address: mainDestination,
      destination_lat: 0,
      destination_lng: 0,
      vehicle_requirements: { vehicle_type: unitType },
      fare: parseFloat(fare) || 0,
      status: 'STATUS_OPEN',
      assigned_driver_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      provider_name: providerName,
      distance_meters: 0,
      archived: false,
      company_name: providerName,
      dispatch_type: dispatchType,
      scheduled_at: scheduledAt,
      vehicle_type: unitType,
      observations: observationsList.length > 0 ? observationsList : undefined,
      payment_term: finalPaymentDate,
      payment_method: finalPaymentType,
    };

    navigation.navigate('SelectGroupsForService', { draftService: newService });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo Servicio</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        {/* Origen */}
        <Text style={styles.label}>Distrito de origen</Text>
        <TextInput
          style={styles.input}
          placeholder="Distrito de origen"
          placeholderTextColor="#999"
          value={origin}
          onChangeText={setOrigin}
        />

        {/* Destinos */}
        <Text style={styles.label}>Distrito de destino</Text>
        {destinations.map((dest, index) => (
          <View key={index} style={styles.destinationRow}>
            <TextInput
              style={[styles.input, styles.destinationInput]}
              placeholder={`Destino ${index + 1}`}
              placeholderTextColor="#999"
              value={dest}
              onChangeText={(text) => updateDestination(index, text)}
            />
            {destinations.length > 1 && (
              <TouchableOpacity onPress={() => removeDestination(index)} style={styles.removeBtn}>
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.addStopBtn} onPress={addDestination}>
          <Text style={styles.addStopText}>+ Agregar destinos</Text>
        </TouchableOpacity>

        {/* Tarifa */}
        <Text style={styles.label}>Tarifa</Text>
        <View style={styles.fareInput}>
          <Text style={styles.farePrefix}>S/</Text>
          <TextInput
            style={styles.fareField}
            placeholder="0.00"
            placeholderTextColor="#999"
            keyboardType="numeric"
            value={fare}
            onChangeText={setFare}
          />
        </View>

        {/* Tipo de pago */}
        <Text style={styles.label}>Tipo de pago</Text>
        <View style={styles.optionsRow}>
          {PAYMENT_TYPES.map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.optionChip, paymentType === type && styles.optionChipActive]}
              onPress={() => setPaymentType(type)}
            >
              <Text
                style={[styles.optionChipText, paymentType === type && styles.optionChipTextActive]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {paymentType === 'Otro' && (
          <TextInput
            style={styles.input}
            placeholder="Especifica el medio de pago"
            placeholderTextColor="#999"
            value={otherPayment}
            onChangeText={setOtherPayment}
          />
        )}

        {/* Fecha de pago */}
        <Text style={styles.label}>Fecha de pago</Text>
        <View style={styles.optionsRow}>
          {PAYMENT_DATES.map((date) => (
            <TouchableOpacity
              key={date}
              style={[styles.optionChip, paymentDate === date && styles.optionChipActive]}
              onPress={() => setPaymentDate(date)}
            >
              <Text
                style={[styles.optionChipText, paymentDate === date && styles.optionChipTextActive]}
              >
                {date}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {paymentDate === 'Escribir' && (
          <TextInput
            style={styles.input}
            placeholder="Especifica la fecha de pago"
            placeholderTextColor="#999"
            value={customPaymentDate}
            onChangeText={setCustomPaymentDate}
          />
        )}

        {/* Tipo de unidad */}
        <Text style={styles.label}>Tipo de unidad</Text>
        <View style={styles.unitGrid}>
          {UNIT_TYPES.map((unit) => (
            <TouchableOpacity
              key={unit}
              style={[styles.unitChip, unitType === unit && styles.unitChipActive]}
              onPress={() => setUnitType(unit)}
            >
              <Text style={[styles.unitChipText, unitType === unit && styles.unitChipTextActive]}>
                {unit}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Fecha y hora del servicio */}
        <Text style={styles.label}>Fecha del servicio</Text>
        <TextInput
          style={styles.input}
          placeholder="DD/MM"
          placeholderTextColor="#999"
          value={serviceDate}
          onChangeText={setServiceDate}
        />

        <Text style={styles.label}>Hora del servicio</Text>
        <TextInput
          style={styles.input}
          placeholder="HH:mm"
          placeholderTextColor="#999"
          value={serviceTime}
          onChangeText={setServiceTime}
        />

        {/* Observación */}
        <Text style={styles.label}>Observación</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Aclaraciones adicionales..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
          value={observation}
          onChangeText={setObservation}
        />

        <View style={styles.spacer} />
      </ScrollView>

      {/* Botón Siguiente */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitText}>Siguiente</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT_BG,
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
  form: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    paddingBottom: 100,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: '#333',
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  destinationInput: {
    flex: 1,
  },
  removeBtn: {
    marginLeft: 8,
    padding: 8,
  },
  removeText: {
    color: '#ff3b30',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addStopBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 8,
  },
  addStopText: {
    color: BLUE,
    fontSize: 14,
    fontWeight: '600',
  },
  fareInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingLeft: 14,
  },
  farePrefix: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 6,
  },
  fareField: {
    flex: 1,
    padding: 14,
    fontSize: 15,
    color: '#333',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  optionChip: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  optionChipActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  optionChipText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: '#fff',
  },
  unitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  unitChip: {
    width: '30%',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    marginRight: '3.3%',
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  unitChipActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  unitChipText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
  unitChipTextActive: {
    color: '#fff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  spacer: {
    height: 20,
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
  },
  submitBtn: {
    backgroundColor: BLUE,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
