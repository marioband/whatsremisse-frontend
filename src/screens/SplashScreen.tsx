import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';

import logoWhatsRemisse from '../../assets/logo-whatsremisse-name.png';
import { RootStackParamList } from '../navigation/RootNavigator';

type SplashNav = StackNavigationProp<RootStackParamList, 'Splash'>;

export function SplashScreen() {
  const navigation = useNavigation<SplashNav>();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Register');
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Image source={logoWhatsRemisse} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 240,
    height: 240,
  },
});
