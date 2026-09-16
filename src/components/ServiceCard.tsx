import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { EstadoServicioBar } from './EstadoServicioBar';
import { COLORS, RADIUS } from '../constants/colors';
import { textoProgramado } from '../lib/datetime';
import { ServiceAlert } from '../types';

interface Props {
  service: ServiceAlert;
  onPress: () => void;
  onArchive: () => void;
  onUnarchive?: () => void;
  onCancelApplication?: () => void;
  showArchived?: boolean;
  disableSwipe?: boolean;
  showReservaIndicator?: boolean;
  isApplied?: boolean;
  isAccepted?: boolean;
  applicationOrder?: number | null;
  notificationCount?: number;
  groupName?: string;
}

export function ServiceCard({
  service,
  onPress,
  onArchive,
  onUnarchive,
  onCancelApplication,
  showArchived = false,
  disableSwipe = false,
  showReservaIndicator = false,
  isApplied = false,
  isAccepted = false,
  applicationOrder = null,
  notificationCount = 0,
  groupName,
}: Props) {
  const swipeableRef = useRef<Swipeable>(null);

  const isActive = isApplied || isAccepted;
  const cardBackground = isAccepted ? COLORS.brightGreen : COLORS.cardNew;

  const getAction = () => {
    if (showArchived) {
      return { label: 'Desarchivar', handler: onUnarchive || onArchive, color: COLORS.primary };
    }
    if (isApplied && onCancelApplication) {
      return { label: 'Anular', handler: onCancelApplication, color: COLORS.grayAction };
    }
    return { label: 'Archivar', handler: onArchive, color: COLORS.grayAction };
  };

  const action = getAction();

  const handleAction = () => {
    swipeableRef.current?.close();
    action.handler();
  };

  const renderRightActions = (_progress: any, _dragX: any) => {
    return (
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: action.color }]}
        onPress={handleAction}
        activeOpacity={0.8}
      >
        <Text style={styles.actionText}>{action.label}</Text>
      </TouchableOpacity>
    );
  };

  const pressDisabled = isApplied && notificationCount === 0;

  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const isReservation =
    !!service.scheduled_at && new Date(service.scheduled_at).getTime() > Date.now() + TWO_HOURS_MS;

  const cardContent = (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: cardBackground }]}
      onPress={pressDisabled ? undefined : onPress}
      activeOpacity={pressDisabled ? 1 : 0.9}
      disabled={pressDisabled}
    >
      {/* Columna izquierda: avatar */}
      <View style={styles.cardBody}>
        <View style={styles.avatarColumn}>
          <View style={[styles.avatar, isActive && styles.avatarActive]}>
            <Text
              style={[
                styles.avatarText,
                isActive && { color: isAccepted ? COLORS.brightGreen : COLORS.primary },
              ]}
            >
              {(service.company_name || service.provider_name || '?').charAt(0)}
            </Text>
          </View>
        </View>

        {/* Columna central */}
        <View style={styles.centerColumn}>
          <Text style={[styles.companyName, isActive && styles.textActive]} numberOfLines={1}>
            {service.company_name || service.provider_name || 'Empresa'}
          </Text>

          {groupName && (
            <Text style={[styles.groupName, isActive && styles.textActiveLight]} numberOfLines={1}>
              {groupName}
            </Text>
          )}

          <View style={styles.dispatchRow}>
            <Text style={[styles.dispatchType, isActive && styles.textActiveLight]}>
              {textoProgramado(service)}
            </Text>
            {isReservation && (
              <Text style={[styles.reservaLabel, isActive && styles.textActiveLight]}>
                {' '}
                (Reserva)
              </Text>
            )}
          </View>

          <View style={styles.locationRow}>
            <View style={[styles.dotOrigin, isActive && styles.dotActive]} />
            <Text style={[styles.locationText, isActive && styles.textActive]} numberOfLines={1}>
              <Text style={[styles.estimate, isActive && styles.textActive]}>
                {service.origin_estimate || ''}{' '}
              </Text>
              {service.origin_address}
            </Text>
          </View>

          <View style={styles.locationRow}>
            <View style={[styles.dotDestination, isActive && styles.dotActive]} />
            <Text style={[styles.locationText, isActive && styles.textActive]} numberOfLines={1}>
              <Text style={[styles.estimate, isActive && styles.textActive]}>
                {service.destination_estimate || ''}{' '}
              </Text>
              {service.destination_address}
            </Text>
          </View>

          {service.observations && service.observations.length > 0 && !isActive && (
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
          <Text style={[styles.amount, isActive && styles.textActive]}>S/ {service.fare}</Text>
          <Text style={[styles.paymentTerm, isActive && styles.textActiveLight]}>
            {service.payment_term || 'Al término'}
          </Text>
          <Text style={[styles.paymentMethod, isActive && styles.textActiveLight]}>
            {service.payment_method || 'BCP'}
          </Text>
        </View>

        {/* Overlay para postulaciones */}
        {isApplied && applicationOrder && (
          <View style={styles.appliedOverlay}>
            <Text style={styles.appliedText}>Postulante N° {applicationOrder}</Text>
          </View>
        )}

        {/* Overlay para servicio aceptado */}
        {isAccepted && (
          <View style={styles.acceptedOverlay}>
            <Text style={styles.acceptedText}>Servicio Aceptado</Text>
            <Text style={styles.acceptedSubtext}>Toca para iniciar</Text>
          </View>
        )}

        {/* Indicador de reserva */}
        {showReservaIndicator && (
          <View style={styles.reservaBadge}>
            <Text style={styles.reservaText}>Reserva</Text>
          </View>
        )}
      </View>

      {/* Franja de estado del servicio (fuente única: estadoDeServicio).
          Vista de conductor: "Disponible" / "No disponible", nunca la señal del
          proveedor que publicó la alerta. */}
      <EstadoServicioBar service={service} radius={RADIUS.xl} vista="CONDUCTOR" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.cardWrapper}>
      {disableSwipe ? (
        cardContent
      ) : (
        <Swipeable
          ref={swipeableRef}
          renderRightActions={renderRightActions}
          friction={2}
          rightThreshold={40}
          overshootRight={false}
          onSwipeableOpen={handleAction}
        >
          {cardContent}
        </Swipeable>
      )}

      {/* Globo de notificación del proveedor (fuera del card para evitar clipping) */}
      {notificationCount > 0 && (
        <View style={styles.notificationBadge}>
          <Text style={styles.notificationText}>
            {notificationCount > 99 ? '99+' : notificationCount}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: 12,
    marginBottom: 12,
    position: 'relative',
    overflow: 'visible',
    zIndex: 1,
  },
  card: {
    borderRadius: RADIUS.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  cardBody: {
    flexDirection: 'row',
    padding: 14,
  },
  avatarColumn: {
    justifyContent: 'center',
    marginRight: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.header,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarActive: {
    backgroundColor: '#fff',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  avatarTextActive: {
    color: COLORS.primary,
  },
  centerColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  companyName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 2,
  },
  groupName: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  dispatchType: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  dispatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reservaLabel: {
    fontSize: 12,
    color: COLORS.orange,
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  dotOrigin: {
    width: 8,
    height: 8,
    borderRadius: 4,
    // Origen en azul de marca y destino en oscuro: los puntos de WhatsApp
    // (azul claro y verde) no son de la paleta.
    backgroundColor: COLORS.primary,
    marginRight: 8,
  },
  dotDestination: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.headerDark,
    marginRight: 8,
  },
  dotActive: {
    backgroundColor: '#fff',
  },
  locationText: {
    fontSize: 13,
    color: '#444',
    flex: 1,
  },
  estimate: {
    color: '#888',
    fontSize: 12,
  },
  appliedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.cardAppliedOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.xl,
  },
  appliedText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  acceptedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(53, 140, 82, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.xl,
  },
  acceptedText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  acceptedSubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
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
  textActive: {
    color: '#fff',
  },
  textActiveLight: {
    color: 'rgba(255,255,255,0.85)',
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: RADIUS.xl,
    marginRight: 12,
    marginBottom: 12,
  },
  actionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  reservaBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.orange,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reservaText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  notificationBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  notificationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
