import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';

import { RootStackParamList } from '../navigation/RootNavigator';

type MembershipNav = StackNavigationProp<RootStackParamList, 'Membership'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';
const GREEN = '#358C52';

const PLANS = [
  { days: 30, price: 'S/ 29.90', popular: true },
  { days: 60, price: 'S/ 49.90', popular: false },
  { days: 90, price: 'S/ 69.90', popular: false },
];

export function MembershipScreen() {
  const navigation = useNavigation<MembershipNav>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Membresía</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Plan actual</Text>
          <Text style={styles.statusValue}>Freemium</Text>
          <Text style={styles.statusDesc}>Acceso básico al feed de servicios.</Text>
        </View>

        <Text style={styles.sectionTitle}>Renovar suscripción</Text>

        {PLANS.map((plan) => (
          <View key={plan.days} style={[styles.planCard, plan.popular && styles.planCardPopular]}>
            <View style={styles.planHeader}>
              <Text style={styles.planDays}>{plan.days} días</Text>
              {plan.popular && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Popular</Text>
                </View>
              )}
            </View>
            <Text style={styles.planPrice}>{plan.price}</Text>
            <Text style={styles.planDesc}>Acceso premium completo sin límites.</Text>
            <TouchableOpacity style={styles.planButton}>
              <Text style={styles.planButtonText}>Elegir plan</Text>
            </TouchableOpacity>
          </View>
        ))}

        <Text style={styles.hint}>
          La activación de planes se procesará a través del proveedor de pagos configurado.
        </Text>
      </ScrollView>
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
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backArrow: { color: '#fff', fontSize: 24, marginRight: 12 },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: { width: 36 },
  body: { flex: 1, backgroundColor: '#fff' },
  bodyContent: { padding: 20, paddingBottom: 40 },
  statusCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  statusLabel: { fontSize: 13, color: '#888', marginBottom: 4 },
  statusValue: { fontSize: 24, fontWeight: 'bold', color: GREEN, marginBottom: 6 },
  statusDesc: { fontSize: 13, color: '#666' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 16 },
  planCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  planCardPopular: {
    borderColor: BLUE,
    borderWidth: 2,
    backgroundColor: '#f8f9ff',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  planDays: { fontSize: 18, fontWeight: 'bold', color: '#111', flex: 1 },
  badge: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  planPrice: { fontSize: 22, fontWeight: 'bold', color: BLUE, marginBottom: 4 },
  planDesc: { fontSize: 13, color: '#666', marginBottom: 14 },
  planButton: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  planButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  hint: {
    fontSize: 12,
    color: '#888',
    marginTop: 10,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
