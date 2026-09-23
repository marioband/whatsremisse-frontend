import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FilaDeslizable } from './FilaDeslizable';

import { useNombreDelProveedor } from '../hooks/useNombreDelProveedor';
import { textoProgramado } from '../lib/datetime';
import { textoDeLasUnidadesDeLaAlerta } from '../lib/unidades';
import { ServiceAlert } from '../types';

interface Props {
  service: ServiceAlert;
  onArchive: () => void;
}

const DARK_GRAY = '#2D2D2D';
const BLUE = '#3F51B5';

export function ProviderServiceCard({ service, onArchive }: Props) {
  const nombreDelProveedor = useNombreDelProveedor(service);
  /** Las unidades que pide la tarjeta, ya en texto («Auto, Camioneta»). */
  const unidadesDelServicio = textoDeLasUnidadesDeLaAlerta(service);

  const renderRightActions = () => (
    <TouchableOpacity style={styles.archiveAction} onPress={onArchive}>
      <Text style={styles.archiveText}>Archivar</Text>
    </TouchableOpacity>
  );

  return (
    /* Deslizable propio (no el de react-native-gesture-handler): ese marca la vista con
       `touch-action: none` y en el iPhone dejaba la lista sin poder desplazarse (22-09-2026). */
    <FilaDeslizable accion={renderRightActions} anchoAccion={92} umbral={40}>
      <View style={styles.card}>
        {/* Columna izquierda: nombre + avatar */}
        <View style={styles.leftColumn}>
          <Text style={styles.groupName} numberOfLines={1}>
            {nombreDelProveedor}
          </Text>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(nombreDelProveedor || '?').charAt(0)}</Text>
          </View>
        </View>

        {/* Columna central */}
        <View style={styles.centerColumn}>
          <Text style={styles.dispatchType}>{textoProgramado(service)}</Text>

          {/* Las unidades que pide la tarjeta (19-09-2026): con varias marcadas hay que poder
              verlas de un vistazo también desde la lista del proveedor. */}
          {unidadesDelServicio !== '' && (
            <View style={styles.unitRow}>
              <Text style={styles.unitLabel}>Unidad</Text>
              <Text style={styles.unitValue}>{unidadesDelServicio}</Text>
            </View>
          )}

          <View style={styles.locationRow}>
            <View style={styles.dotOrigin} />
            <Text style={styles.locationText} numberOfLines={1}>
              {service.origin_address}
            </Text>
          </View>

          <View style={styles.locationRow}>
            <View style={styles.dotDestination} />
            <Text style={styles.locationText} numberOfLines={1}>
              {service.destination_address}
            </Text>
          </View>

          {service.observations && service.observations.length > 0 && (
            <View style={styles.observationsRow}>
              {service.observations.map((obs, index) => (
                <View key={index} style={styles.observationBadge}>
                  <Text style={styles.observationText}>{obs}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Columna derecha */}
        <View style={styles.rightColumn}>
          <Text style={styles.amount}>S/ {service.fare}</Text>
          <Text style={styles.paymentTerm}>{service.payment_term || 'Al término'}</Text>
          <Text style={styles.paymentMethod}>{service.payment_method || 'BCP'}</Text>
        </View>
      </View>
    </FilaDeslizable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    /* Mismo fondo para todas las tarjetas de servicio (18-09-2026). */
    backgroundColor: '#F2F2F2',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  leftColumn: {
    alignItems: 'center',
    marginRight: 12,
    width: 70,
  },
  groupName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 6,
    textAlign: 'center',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: DARK_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  centerColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  dispatchType: {
    fontSize: 13,
    fontWeight: '600',
    color: BLUE,
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  unitLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: BLUE,
    marginRight: 6,
  },
  unitValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    flexShrink: 1,
  },
  dotOrigin: {
    width: 8,
    height: 8,
    borderRadius: 4,
    // Origen en azul de marca y destino en oscuro (paleta de la app).
    backgroundColor: '#3F51B5',
    marginRight: 8,
  },
  dotDestination: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DARK_GRAY,
    marginRight: 8,
  },
  locationText: {
    fontSize: 13,
    color: '#444',
    flex: 1,
  },
  observationsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  observationBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 4,
  },
  observationText: {
    fontSize: 11,
    color: '#E65100',
  },
  rightColumn: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginLeft: 10,
    minWidth: 70,
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 4,
  },
  paymentTerm: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  paymentMethod: {
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
  },
  archiveAction: {
    backgroundColor: '#C2333F',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 16,
    marginRight: 12,
  },
  archiveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
