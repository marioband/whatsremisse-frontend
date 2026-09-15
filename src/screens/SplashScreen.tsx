import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect } from 'react';

import { BrandLoader } from '../components/BrandLoader';
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

  return <BrandLoader />;
}
