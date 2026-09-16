import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { EstadoServicioBar } from './EstadoServicioBar';
import { COLORS, RADIUS } from '../constants/colors';
import { useNombreDelProveedor } from '../hooks/useNombreDelProveedor';
import { textoProgramado } from '../lib/datetime';
import { MiPostulacionEnLaTarjeta } from '../lib/estadoServicio';
import { ServiceAlert } from '../types';

interface Props {
  service: ServiceAlert;
  /** En el chat la tarjeta no se toca ni se archiva: los dos son opcionales. */
  onPress?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onCancelApplication?: () => void;
  showArchived?: boolean;
  disableSwipe?: boolean;
  showReservaIndicator?: boolean;
  isApplied?: boolean;
  /**
   * Franja inferior según QUIÉN mira la tarjeta. En el chat la ve el proveedor
   * también, y su señal es la de su alerta (¿la compartió?, ¿hay postulantes?),
   * no la del conductor.
   */
  vista?: 'CONDUCTOR' | 'PROVEEDOR';
  /** Pie de la tarjeta (debajo de la franja): datos a copiar, botón de navegación… */
  pie?: React.ReactNode;
  /**
   * Mi postulación en este servicio: con ella la franja inferior dice el puesto
   * ("Postulante 2"), que quedó aceptado o que quedó fuera. Antes esto se pintaba
   * como una capa sobre toda la tarjeta (azul al postularse, verde al ser aceptado).
   */
  miPostulacion?: MiPostulacionEnLaTarjeta;
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
  vista = 'CONDUCTOR',
  pie,
  miPostulacion,
  notificationCount = 0,
  groupName,
}: Props) {
  const swipeableRef = useRef<Swipeable>(null);
  // El nombre lo configura el proveedor en su perfil; si no lo configuró, van su
  // primer nombre y su primer apellido (nunca "Empresa").
  const nombreDelProveedor = useNombreDelProveedor(service);

  const cardBackground = COLORS.cardNew;

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
    action.handler?.();
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
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(nombreDelProveedor || '?').charAt(0)}</Text>
          </View>
        </View>

        {/* Columna central */}
        <View style={styles.centerColumn}>
          <Text style={styles.companyName} numberOfLines={1}>
            {nombreDelProveedor}
          </Text>

          {groupName && (
            <Text style={styles.groupName} numberOfLines={1}>
              {groupName}
            </Text>
          )}

          <View style={styles.dispatchRow}>
            <Text style={styles.dispatchType}>{textoProgramado(service)}</Text>
            {isReservation && <Text style={styles.reservaLabel}> (Reserva)</Text>}
          </View>

          <View style={styles.locationRow}>
            <View style={styles.dotOrigin} />
            <Text style={styles.locationText} numberOfLines={1}>
              <Text style={styles.estimate}>{service.origin_estimate || ''} </Text>
              {service.origin_address}
            </Text>
          </View>

          <View style={styles.locationRow}>
            <View style={styles.dotDestination} />
            <Text style={styles.locationText} numberOfLines={1}>
              <Text style={styles.estimate}>{service.destination_estimate || ''} </Text>
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

        {/* Indicador de reserva */}
        {showReservaIndicator && (
          <View style={styles.reservaBadge}>
            <Text style={styles.reservaText}>Reserva</Text>
          </View>
        )}
      </View>

      {/* Franja inferior: la MISMA que usan las tarjetas del proveedor, ahora para el
          estado del conductor — azul con su puesto de postulante, verde si lo
          aceptaron y rojo si quedó fuera (rechazado o cubierto por otro)—. Antes el
          estado se pintaba como una capa sobre toda la tarjeta; el usuario lo cambió
          justamente por esto. Va dentro de la tarjeta para heredar su redondeo. */}
      <EstadoServicioBar
        service={service}
        vista={vista}
        miPostulacion={miPostulacion}
        radius={RADIUS.xl}
      />

      {/* Pie de la tarjeta: en el chat, el botón de navegación del conductor (y los
          datos a copiar del proveedor). Va dentro de la tarjeta para heredar su
          redondeo, y después de la franja para que la estructura de arriba sea
          idéntica a la de la pantalla "Todos" del conductor. */}
      {pie}
    </TouchableOpacity>
  );

  return (
    <View style={styles.cardWrapper}>
      {disableSwipe || !action.handler ? (
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
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
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
  },
  dispatchRow: {
    flexDirection: 'row',
    // Con `center` la hora y el rótulo "Reserva" quedaban desalineados (la hora
    // arrastraba un marginBottom propio que la subía respecto del texto). Ahora las
    // dos cajas comparten línea base: es lo que pidió el usuario.
    alignItems: 'baseline',
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
  locationText: {
    fontSize: 13,
    color: '#444',
    flex: 1,
  },
  estimate: {
    color: '#888',
    fontSize: 12,
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
