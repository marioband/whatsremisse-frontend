import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { BankDetailsRow } from './BankDetailsRow';
import { ServiceAlert } from '../../types';

interface SettlementPanelProps {
  service: ServiceAlert;
  userProfile?: { yapeNumber?: string; bcpAccount?: string; bcpCci?: string };
  onCopy: (label: string, value: string) => void;
}

const ORANGE = '#FF9800';

export function SettlementPanel({ service, userProfile, onCopy }: SettlementPanelProps) {
  if (!service.settlement_enabled) return null;

  const yapeNumber = service.provider_yape || userProfile?.yapeNumber;
  const bcpAccount = service.provider_bcp_account || userProfile?.bcpAccount;
  const bcpCci = service.provider_bcp_cci || userProfile?.bcpCci;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>⚡ Cuadre financiero</Text>
      <Text style={styles.fare}>Total a pagar: S/ {service.fare}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Datos de pago del proveedor</Text>
        {!!yapeNumber && (
          <BankDetailsRow
            label="Yape"
            value={yapeNumber}
            onCopy={(v) => onCopy('Número Yape', v)}
          />
        )}
        {!!bcpAccount && (
          <BankDetailsRow
            label="Cuenta BCP"
            value={bcpAccount}
            onCopy={(v) => onCopy('Cuenta BCP', v)}
          />
        )}
        {!!bcpCci && (
          <BankDetailsRow label="CCI BCP" value={bcpCci} onCopy={(v) => onCopy('CCI BCP', v)} />
        )}
      </View>

      {service.driver_payment_received && (
        <View style={styles.closureBox}>
          <Text style={styles.closureText}>✔ Servicio y pago cerrados</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: ORANGE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  title: { fontSize: 15, fontWeight: 'bold', color: ORANGE, marginBottom: 6 },
  fare: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 12 },
  section: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#111', marginBottom: 10 },
  closureBox: {
    marginTop: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  closureText: { color: '#358C52', fontWeight: 'bold', fontSize: 14 },
});
