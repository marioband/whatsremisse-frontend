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

import { AddressInput, DireccionConfirmada } from '../components/AddressInput';
import { CalendarMonthPicker } from '../components/CalendarMonthPicker';
import { TimeWheelPicker } from '../components/TimeWheelPicker';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import {
  combinarFechaYHora,
  etiquetaRelativa,
  formatearFecha,
  formatearHora,
  horaCoherente,
  inicioDelDia,
  mismoDia,
  primerInstanteValido,
  proximaHoraRedondeada,
} from '../lib/datetime';
import { filaDestino, FILA_ORIGEN, zIndexDeFila } from '../lib/desplegables';
import {
  estaVencido,
  AVISO_DE_CIERRE_MINUTOS,
  MINUTOS_AL_MOMENTO,
  MINUTOS_CON_HORA,
} from '../lib/estadoServicio';
import { estaCompartido } from '../lib/gruposDeServicio';
import { hayApiDeDirecciones } from '../lib/places';
import { esPremium } from '../lib/premium';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ServiceAlert, ServiceStatus } from '../types';

type CreateNav = StackNavigationProp<
  RootStackParamList,
  'CreateService' | 'SelectGroupsForService'
>;
type CreateRoute = RouteProp<RootStackParamList, 'CreateService'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';
const LIGHT_BG = '#F0F2F5';
const OSCURO = '#2D2D2D';
const ROJO_ACCION = '#C2333F';

const PAYMENT_TYPES = ['BCP', 'Yape', 'Plin', 'Efectivo', 'Otro'];
const PAYMENT_DATES = ['Al término', 'Durante el día', 'Mañana', 'Escribir'];
const UNIT_TYPES = ['Todos', 'Auto compacto', 'Auto', 'Camioneta', 'Camioneta 3 filas'];
/** Momento del servicio: "Al momento" es el default; la hora específica abre el reloj. */
const MOMENTOS_DEL_SERVICIO = ['Al momento', 'Hora específica'];

export function CreateServiceScreen() {
  const navigation = useNavigation<CreateNav>();
  const route = useRoute<CreateRoute>();
  const { addService, updateService, deleteService } = useMockStore();
  const { session, profile } = useAuth();
  const editingService = route.params?.service;
  const isEditing = !!editingService;

  const getInitialDateTime = () => {
    if (editingService?.scheduled_at) {
      const programada = new Date(editingService.scheduled_at);
      return { fecha: programada, hora: programada };
    }
    // Fecha de hoy y la siguiente hora en punto (10:51 -> 11:00).
    return { fecha: new Date(), hora: proximaHoraRedondeada() };
  };

  const initialDateTime = getInitialDateTime();

  const [origin, setOrigin] = useState(editingService?.origin_address || '');
  const [destinations, setDestinations] = useState<string[]>(
    editingService?.origin_address ? [editingService.destination_address] : ['']
  );
  // Coordenadas cuando la dirección sale de una sugerencia: hacen la medición de
  // distancia/tiempo exacta (y evitan que Google tenga que geocodificar).
  const [coordsOrigen, setCoordsOrigen] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsDestinos, setCoordsDestinos] = useState<
    Record<number, { lat: number; lng: number } | null>
  >({});
  const premium = esPremium(profile);
  const faltanSugerencias = premium && !hayApiDeDirecciones();
  const [fare, setFare] = useState(editingService ? String(editingService.fare) : '');
  const [paymentType, setPaymentType] = useState(editingService?.payment_method || 'BCP');
  const [otherPayment, setOtherPayment] = useState('');
  const [paymentDate, setPaymentDate] = useState(editingService?.payment_term || 'Al término');
  const [customPaymentDate, setCustomPaymentDate] = useState('');
  const [unitType, setUnitType] = useState(editingService?.vehicle_type || 'Todos');
  const [observation, setObservation] = useState(editingService?.observations?.join(', ') || '');
  const [fechaServicio, setFechaServicio] = useState<Date>(initialDateTime.fecha);
  const [horaServicio, setHoraServicio] = useState<Date>(initialDateTime.hora);
  /**
   * Momento del servicio: **por defecto "Al momento"** (regla del usuario). Solo al
   * elegir "Hora específica" se abren la fecha y el reloj; y la alerta dura distinto
   * según el modo (20 minutos al momento, 10 con hora específica, ver `estadoServicio`).
   */
  const [alMomento, setAlMomento] = useState(!editingService?.scheduled_at);
  const [abriendoCalendario, setAbriendoCalendario] = useState(false);
  const [abriendoReloj, setAbriendoReloj] = useState(false);
  /**
   * Qué campo tiene el desplegable de sugerencias abierto. La fila abierta se
   * levanta sobre las demás: sin esto, el desplegable del distrito de ORIGEN queda
   * tapado por el campo Destino 1 (en web, con el mismo zIndex gana la fila que va
   * después en el documento).
   */
  const [campoConSugerencias, setCampoConSugerencias] = useState<string | null>(null);

  /** Aviso de un campo: al abrir se levanta; al cerrar, solo si sigue siendo el mío. */
  const avisoDeSugerencias = (campo: string) => (visibles: boolean) => {
    setCampoConSugerencias((actual) => (visibles ? campo : actual === campo ? null : actual));
  };

  // Bloqueo de coherencia: para hoy, la primera hora agendable es el siguiente
  // tramo de 5 minutos (a las 11:15 a.m. ya no se pueden elegir las 11:00 a.m.).
  const ahora = new Date();
  const esHoy = mismoDia(fechaServicio, ahora);
  const desdeHoy = primerInstanteValido(fechaServicio, ahora);
  const restringeHoy = esHoy && desdeHoy.getTime() > inicioDelDia(fechaServicio).getTime();
  const momentoProgramado = combinarFechaYHora(fechaServicio, horaServicio);
  const coherenciaPendiente = momentoProgramado.getTime() <= ahora.getTime();

  /** Al cambiar el día, la hora se ajusta si quedó en el pasado. */
  const elegirFecha = (fecha: Date) => {
    setFechaServicio(fecha);
    setHoraServicio((hora) => horaCoherente(fecha, hora));
    setAbriendoCalendario(false);
  };

  const elegirHora = (hora: Date) => {
    setHoraServicio(horaCoherente(fechaServicio, hora));
    setAbriendoReloj(false);
  };

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
    setCoordsDestinos((actuales) => {
      const siguientes: Record<number, { lat: number; lng: number } | null> = {};
      Object.entries(actuales).forEach(([clave, valor]) => {
        const posicion = Number(clave);
        if (posicion < index) siguientes[posicion] = valor;
        else if (posicion > index) siguientes[posicion - 1] = valor;
      });
      return siguientes;
    });
  };

  const confirmarOrigen = (direccion: DireccionConfirmada) => {
    setOrigin(direccion.texto);
    setCoordsOrigen(
      direccion.lat !== null && direccion.lng !== null
        ? { lat: direccion.lat, lng: direccion.lng }
        : null
    );
  };

  const confirmarDestino = (index: number, direccion: DireccionConfirmada) => {
    updateDestination(index, direccion.texto);
    setCoordsDestinos((actuales) => ({
      ...actuales,
      [index]:
        direccion.lat !== null && direccion.lng !== null
          ? { lat: direccion.lat, lng: direccion.lng }
          : null,
    }));
  };

  /** Valida lo que hay en pantalla y arma el servicio (null si falta algo). */
  const construirServicio = (): ServiceAlert | null => {
    if (!origin || !destinations[0] || !fare) {
      Alert.alert(
        'Campos incompletos',
        alMomento
          ? 'Completa origen, destino y tarifa.'
          : 'Completa origen, destino, tarifa, fecha y hora.'
      );
      return null;
    }

    const programada = combinarFechaYHora(fechaServicio, horaServicio);
    // Coherencia solo con hora específica: un servicio "al momento" se publica ya.
    // (Por si la pantalla quedó abierta y el momento elegido ya pasó: se ajusta la
    // hora y se avisa, en vez de guardar algo imposible.)
    if (!alMomento && programada.getTime() <= Date.now()) {
      const ajustada = horaCoherente(fechaServicio, horaServicio);
      setHoraServicio(ajustada);
      Alert.alert(
        'Hora ajustada',
        `La hora elegida (${formatearHora(horaServicio)}) ya pasó. La ajusté a las ` +
          `${formatearHora(ajustada)} para hoy. Revisa y vuelve a intentarlo.`
      );
      return null;
    }

    const userId = session?.user?.id;
    if (!userId && !editingService) {
      Alert.alert('Sesión requerida', 'Debes iniciar sesión para publicar un servicio.');
      return null;
    }

    const mainDestination = destinations[destinations.length - 1];
    const intermediateStops = destinations.slice(0, -1).filter(Boolean);
    const coordsPrincipal = coordsDestinos[destinations.length - 1] || null;
    const finalPaymentType = paymentType === 'Otro' && otherPayment ? otherPayment : paymentType;
    const finalPaymentDate =
      paymentDate === 'Escribir' && customPaymentDate ? customPaymentDate : paymentDate;

    const observationsList = [
      observation,
      intermediateStops.length > 0 ? `Paradas: ${intermediateStops.join(', ')}` : '',
    ].filter(Boolean);

    const scheduledAt = alMomento ? null : programada.toISOString();
    const providerName = profile?.full_name || editingService?.provider_name || 'Proveedor';

    const base: ServiceAlert = editingService ?? {
      id: `service-${Date.now()}`,
      provider_id: userId || '',
      group_id: '',
      title: '',
      description: '',
      origin_address: '',
      origin_lat: 0,
      origin_lng: 0,
      destination_address: '',
      destination_lat: 0,
      destination_lng: 0,
      vehicle_requirements: { vehicle_type: unitType },
      fare: 0,
      status: 'STATUS_OPEN',
      assigned_driver_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      provider_name: providerName,
      distance_meters: 0,
      archived: false,
      company_name: providerName,
    };

    // Un servicio vencido que se vuelve a programar se reabre: sale de la lista
    // de vencidos y vuelve a estar disponible (sin conductor asignado).
    const reabrir = !!editingService && estaVencido(editingService);

    return {
      ...base,
      title: `${origin} -> ${mainDestination}`,
      description: `Unidad: ${unitType}${observation ? ` • ${observation}` : ''}`,
      origin_address: origin,
      origin_lat: coordsOrigen?.lat ?? base.origin_lat ?? 0,
      origin_lng: coordsOrigen?.lng ?? base.origin_lng ?? 0,
      destination_address: mainDestination,
      destination_lat: coordsPrincipal?.lat ?? base.destination_lat ?? 0,
      destination_lng: coordsPrincipal?.lng ?? base.destination_lng ?? 0,
      vehicle_requirements: { vehicle_type: unitType },
      vehicle_type: unitType,
      fare: parseFloat(fare) || 0,
      scheduled_at: scheduledAt,
      observations: observationsList.length > 0 ? observationsList : undefined,
      payment_term: finalPaymentDate,
      payment_method: finalPaymentType,
      updated_at: new Date().toISOString(),
      ...(reabrir
        ? {
            status: 'STATUS_OPEN' as ServiceStatus,
            assigned_driver_id: null,
            driver_progress_step: 0,
            settlement_enabled: false,
            commission_paid: false,
            driver_payment_received: false,
          }
        : {}),
    };
  };

  /** Guardar: la tarjeta queda en la lista; sin grupos, "no compartida". */
  const handleGuardar = () => {
    const servicio = construirServicio();
    if (!servicio) return;

    if (editingService) {
      updateService(servicio);
      Alert.alert(
        'Servicio guardado',
        estaCompartido(editingService)
          ? 'Los cambios quedaron guardados.'
          : 'La tarjeta sigue sin compartir. Elige grupos cuando quieras publicarla.'
      );
      navigation.goBack();
      return;
    }

    addService({ ...servicio, group_id: '' });
    Alert.alert(
      'Servicio guardado',
      'La tarjeta quedó en tu lista como "Servicio no compartido". Para que la vean los ' +
        'conductores, entra a la tarjeta y elige grupos.'
    );
    navigation.navigate('Main');
  };

  /** Elegir grupos: es el paso que publica el servicio a los conductores. */
  const handleElegirGrupos = () => {
    const servicio = construirServicio();
    if (!servicio) return;

    navigation.navigate('SelectGroupsForService', {
      draftService: servicio,
      serviceId: editingService?.id,
    });
  };

  /** Anular: borra la tarjeta (o descarta el borrador si aún no se guardó). */
  const handleAnular = () => {
    if (!editingService) {
      Alert.alert('Descartar servicio', 'Se perderá lo que escribiste. ¿Descartarlo?', [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
      return;
    }

    Alert.alert(
      'Anular tarjeta',
      'La tarjeta se eliminará de la lista, junto con sus postulaciones y su chat.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Anular',
          style: 'destructive',
          onPress: async () => {
            const anulada = await deleteService(editingService.id);
            if (anulada) {
              Alert.alert('Tarjeta anulada', 'El servicio se eliminó de la lista.');
              navigation.navigate('Main');
            }
          },
        },
      ]
    );
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
        <Text style={styles.headerTitle}>{isEditing ? 'Editar Servicio' : 'Nuevo Servicio'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        {/* Origen */}
        <Text style={styles.label}>Distrito de origen</Text>
        <View
          style={[
            styles.campoConSugerencias,
            { zIndex: zIndexDeFila(campoConSugerencias, FILA_ORIGEN) },
          ]}
        >
          <AddressInput
            valor={origin}
            placeholder="Distrito de origen"
            premium={premium}
            onChangeText={setOrigin}
            onConfirmar={confirmarOrigen}
            onSugerenciasVisibles={avisoDeSugerencias(FILA_ORIGEN)}
          />
        </View>
        {!premium && (
          <Text style={styles.notaPremium}>
            Las sugerencias de dirección son parte de Premium. Puedes escribir tu dirección y
            elegirla igual: aparecerá como primera opción.
          </Text>
        )}
        {faltanSugerencias && (
          <Text style={styles.notaPremium}>
            Falta la clave de Google Maps (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) para mostrar
            sugerencias.
          </Text>
        )}

        {/* Destinos */}
        <Text style={styles.label}>Distrito de destino</Text>
        {destinations.map((dest, index) => (
          <View
            key={index}
            style={[
              styles.destinationRow,
              { zIndex: zIndexDeFila(campoConSugerencias, filaDestino(index)) },
            ]}
          >
            <View style={styles.destinationInput}>
              <AddressInput
                valor={dest}
                placeholder={`Destino ${index + 1}`}
                premium={premium}
                onChangeText={(texto) => updateDestination(index, texto)}
                onConfirmar={(direccion) => confirmarDestino(index, direccion)}
                onSugerenciasVisibles={avisoDeSugerencias(filaDestino(index))}
              />
            </View>
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

        {/* Momento del servicio: "Al momento" por defecto (regla del usuario). Solo
            al elegir "Hora específica" se abren el calendario y el reloj. */}
        <Text style={styles.label}>Hora del servicio</Text>
        <View style={styles.optionsRow}>
          {MOMENTOS_DEL_SERVICIO.map((opcion) => {
            const activo = (opcion === 'Al momento') === alMomento;
            return (
              <TouchableOpacity
                key={opcion}
                style={[styles.optionChip, activo && styles.optionChipActive]}
                onPress={() => setAlMomento(opcion === 'Al momento')}
              >
                <Text style={[styles.optionChipText, activo && styles.optionChipTextActive]}>
                  {opcion}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {alMomento ? (
          <Text style={styles.helperText}>
            La alerta se publica ahora y se mantiene {MINUTOS_AL_MOMENTO} minutos en los grupos; en
            los últimos {AVISO_DE_CIERRE_MINUTOS} avisa con cuenta atrás.
          </Text>
        ) : (
          <>
            <Text style={styles.label}>Fecha del servicio</Text>
            <TouchableOpacity
              style={styles.pickerField}
              onPress={() => setAbriendoCalendario(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerIcon}>🗓️</Text>
              <Text style={styles.pickerValue}>{formatearFecha(fechaServicio)}</Text>
              {etiquetaRelativa(fechaServicio) ? (
                <Text style={styles.pickerHint}>{etiquetaRelativa(fechaServicio)}</Text>
              ) : null}
              <Text style={styles.pickerChevron}>›</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Hora específica</Text>
            <TouchableOpacity
              style={[styles.pickerField, coherenciaPendiente && styles.pickerFieldError]}
              onPress={() => setAbriendoReloj(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerIcon}>🕐</Text>
              <Text style={styles.pickerValue}>{formatearHora(horaServicio)}</Text>
              <Text style={styles.pickerChevron}>›</Text>
            </TouchableOpacity>
            {restringeHoy ? (
              <Text style={styles.helperText}>
                Hoy solo se pueden elegir horas posteriores a las {formatearHora(desdeHoy)}.
              </Text>
            ) : null}
            <Text style={styles.helperText}>
              La alerta se mantiene {MINUTOS_CON_HORA} minutos en los grupos.
            </Text>
          </>
        )}

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

      {/* Pie: Anular · Guardar · Elegir grupos (antes "Siguiente") */}
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.footerBtn, styles.anularBtn]} onPress={handleAnular}>
          <Text style={styles.anularText}>Anular</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.footerBtn, styles.guardarBtn]} onPress={handleGuardar}>
          <Text style={styles.footerBtnText}>Guardar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.footerBtn, styles.gruposBtn]} onPress={handleElegirGrupos}>
          <Text style={styles.footerBtnText}>Elegir grupos</Text>
        </TouchableOpacity>
      </View>

      <CalendarMonthPicker
        visible={abriendoCalendario}
        valor={fechaServicio}
        onSeleccionar={elegirFecha}
        onCancelar={() => setAbriendoCalendario(false)}
      />

      <TimeWheelPicker
        visible={abriendoReloj}
        fecha={fechaServicio}
        valor={horaServicio}
        onConfirmar={elegirHora}
        onCancelar={() => setAbriendoReloj(false)}
      />
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
  notaPremium: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
    lineHeight: 16,
  },
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
  },
  pickerIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  pickerValue: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
  },
  pickerHint: {
    fontSize: 13,
    color: BLUE,
    fontWeight: '600',
    marginRight: 8,
  },
  pickerChevron: {
    fontSize: 20,
    color: BLUE,
    fontWeight: '700',
  },
  pickerFieldError: {
    borderWidth: 1,
    borderColor: '#C2333F',
  },
  helperText: {
    fontSize: 12,
    color: '#C2333F',
    marginTop: 6,
    lineHeight: 16,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    // `position: relative` crea el contexto de apilado; el zIndex lo pone la pantalla
    // según qué desplegable esté abierto (ver src/lib/desplegables.ts): un zIndex fijo
    // igual al de la fila de origen hacía que "Destino 1" tapara las sugerencias del
    // distrito de origen.
    position: 'relative',
  },
  campoConSugerencias: {
    position: 'relative',
  },
  destinationInput: {
    flex: 1,
  },
  removeBtn: {
    marginLeft: 8,
    padding: 8,
  },
  removeText: {
    color: '#C2333F',
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
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
  },
  footerBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  footerBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  anularBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: ROJO_ACCION,
  },
  anularText: {
    color: ROJO_ACCION,
    fontSize: 14,
    fontWeight: 'bold',
  },
  guardarBtn: {
    backgroundColor: OSCURO,
  },
  gruposBtn: {
    backgroundColor: BLUE,
  },
});
