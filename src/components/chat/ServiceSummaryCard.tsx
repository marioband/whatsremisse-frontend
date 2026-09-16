import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { BankDetailsRow } from './BankDetailsRow';
import { textoProgramado } from '../../lib/datetime';
import { ServiceAlert } from '../../types';

interface ServiceSummaryCardProps {
  service: ServiceAlert;
  isProvider: boolean;
  showCopyData?: boolean;
  showFinancialDetails?: boolean;
  onCopyData?: () => void;
  onCopyBank?: (label: string, value: string) => void;
}

const BLUE = '#3F51B5';

export function ServiceSummaryCard({
  service,
  isProvider,
  showCopyData,
  showFinancialDetails,
  onCopyData,
  onCopyBank,
}: ServiceSummaryCardProps) {
  const handleBankCopy = (label: string, value: string) => {
    onCopyBank?.(label, value);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarPlaceholder} />
        <View style={styles.cardBody}>
          <Text style={styles.companyName} numberOfLines={1}>
            {service.company_name || service.provider_name || 'Empresa'}
          </Text>
          <Text style={styles.timeText}>{textoProgramado(service)}</Text>
          <Text style={styles.routeText}>
            <Text style={styles.label}>Origen:</Text> {service.origin_address}
          </Text>
          <Text style={styles.routeText}>
            <Text style={styles.label}>Destino:</Text> {service.destination_address}
          </Text>
          <Text style={styles.routeText}>
            <Text style={styles.label}>Observación:</Text>{' '}
            {(service.observations || []).join(', ') || '-'}
          </Text>
        </View>
        <View style={styles.cardAmount}>
          <Text style={styles.priceText}>S/ {service.fare}</Text>
          <Text style={styles.paymentMethodText}>
            {service.payment_term || 'Al término'}
            {service.payment_method || 'BCP'}
          </Text>
        </View>
      </View>

      {isProvider && showCopyData && onCopyData && (
        <TouchableOpacity style={styles.copyDataBtn} onPress={onCopyData}>
          <Text style={styles.copyDataBtnText}>Copiar datos</Text>
        </TouchableOpacity>
      )}

      {showFinancialDetails && onCopyBank && (
        <View style={styles.bankDetailsContainer}>
          {!!service.provider_yape && (
            <BankDetailsRow
              label="Yape"
              value={service.provider_yape}
              onCopy={(v) => handleBankCopy('Número Yape', v)}
            />
          )}
          {!!service.provider_bcp_account && (
            <BankDetailsRow
              label="BCP"
              value={service.provider_bcp_account}
              onCopy={(v) => handleBankCopy('Cuenta BCP', v)}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F5F5F5',
    borderRadius: 24,
    padding: 16,
    marginVertical: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ddd',
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  companyName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2D2D2D',
  },
  timeText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
  },
  routeText: {
    fontSize: 13,
    color: '#444',
    marginBottom: 2,
  },
  label: { fontWeight: 'bold', color: '#2D2D2D' },
  cardAmount: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2D2D2D',
  },
  paymentMethodText: {
    fontSize: 11,
    color: '#888',
    textAlign: 'right',
    marginTop: 4,
  },
  copyDataBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  copyDataBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  bankDetailsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
  },
});
