import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { View, Text, TextInput, Button, ScrollView, StyleSheet } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { Alert } from '../lib/alert';
import { invokeFunction } from '../lib/supabase';

export function CreateServiceAlertScreen() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [originAddress, setOriginAddress] = useState('');
  const [originLat, setOriginLat] = useState('');
  const [originLng, setOriginLng] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationLat, setDestinationLat] = useState('');
  const [destinationLng, setDestinationLng] = useState('');
  const [fare, setFare] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title || !originAddress || !destinationAddress || !fare) {
      Alert.alert('Completa los campos obligatorios');
      return;
    }
    setLoading(true);
    try {
      await invokeFunction('create-service-alert', {
        title,
        description,
        origin_address: originAddress,
        origin_lat: parseFloat(originLat),
        origin_lng: parseFloat(originLng),
        destination_address: destinationAddress,
        destination_lat: parseFloat(destinationLat),
        destination_lng: parseFloat(destinationLng),
        fare: parseFloat(fare),
        group_id: profile?.group_id,
      });
      Alert.alert('Alerta creada');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Nueva alerta de servicio</Text>
      <TextInput style={styles.input} placeholder="Título" value={title} onChangeText={setTitle} />
      <TextInput
        style={styles.input}
        placeholder="Descripción"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <Text style={styles.section}>Origen</Text>
      <TextInput
        style={styles.input}
        placeholder="Dirección"
        value={originAddress}
        onChangeText={setOriginAddress}
      />
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="Lat"
          value={originLat}
          onChangeText={setOriginLat}
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="Lng"
          value={originLng}
          onChangeText={setOriginLng}
          keyboardType="numeric"
        />
      </View>
      <Text style={styles.section}>Destino</Text>
      <TextInput
        style={styles.input}
        placeholder="Dirección"
        value={destinationAddress}
        onChangeText={setDestinationAddress}
      />
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="Lat"
          value={destinationLat}
          onChangeText={setDestinationLat}
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="Lng"
          value={destinationLng}
          onChangeText={setDestinationLng}
          keyboardType="numeric"
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Tarifa"
        value={fare}
        onChangeText={setFare}
        keyboardType="numeric"
      />
      <Button
        title={loading ? 'Creando...' : 'Publicar'}
        onPress={handleSubmit}
        disabled={loading}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  section: { fontWeight: '600', marginTop: 12, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48%' },
});
