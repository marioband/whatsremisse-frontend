import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';

import { BrandLoader } from '../components/BrandLoader';
import { useAuth } from '../context/AuthContext';
import { AlertHost } from '../lib/alert';
import { AddParticipantScreen } from '../screens/AddParticipantScreen';
import { AppLockScreen } from '../screens/AppLockScreen';
import { ApplicantsScreen } from '../screens/ApplicantsScreen';
import { BlockedDriversScreen } from '../screens/BlockedDriversScreen';
import { BlockedProvidersScreen } from '../screens/BlockedProvidersScreen';
import { BlockedUserProfileScreen } from '../screens/BlockedUserProfileScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { CreateGroupScreen } from '../screens/CreateGroupScreen';
import { CreateServiceAlertScreen } from '../screens/CreateServiceAlertScreen';
import { CreateServiceScreen } from '../screens/CreateServiceScreen';
import { EstadisticasScreen } from '../screens/EstadisticasScreen';
import { GroupChatScreen } from '../screens/GroupChatScreen';
import { GroupMembersScreen } from '../screens/GroupMembersScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MembershipScreen } from '../screens/MembershipScreen';
import { MyServicesScreen } from '../screens/MyServicesScreen';
import { NavegacionScreen } from '../screens/NavegacionScreen';
import { ParticipantDetailScreen } from '../screens/ParticipantDetailScreen';
import { PaymentDetailsScreen } from '../screens/PaymentDetailsScreen';
import { PrivacyScreen } from '../screens/PrivacyScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { SelectGroupsForServiceScreen } from '../screens/SelectGroupsForServiceScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { BlockedUser, ServiceAlert } from '../types';

export type RootStackParamList = {
  Splash: undefined;
  Login: { phone?: string };
  Register: undefined;
  ProfileSetup: undefined;
  Main: undefined;
  CreateServiceAlert: undefined;
  CreateService: { service?: ServiceAlert } | undefined;
  SelectGroupsForService: {
    draftService: ServiceAlert;
    /** Si viene, se está eligiendo grupo para una tarjeta que YA existe. */
    serviceId?: string;
  };
  CreateGroup: undefined;
  GroupMembers: { groupId: string; groupName: string };
  AddParticipant: { groupId: string; groupName: string };
  ApplicantsScreen: { serviceId: string };
  Chat: { serviceId: string; driverId?: string; driverName?: string };
  GroupChat: { groupId: string; groupName: string };
  ParticipantDetail: {
    groupId: string;
    memberId: string;
    memberName: string;
    memberRole: 'owner' | 'admin' | 'member';
  };
  Settings: undefined;
  /** Cuenta → Estadísticas: ingresos por servicios pagados y cerrados. */
  Estadisticas: undefined;
  /** Cuenta → Navegación: con qué app se abren las rutas (Google Maps o Waze). */
  Navegacion: undefined;
  PaymentDetails: { fromOnboarding?: boolean } | undefined;
  MyServices: undefined;
  Privacy: undefined;
  BlockedDrivers: undefined;
  BlockedProviders: undefined;
  BlockedUserProfile: { user: BlockedUser };
  AppLock: undefined;
  Membership: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { session, loading, requiresProfileSetup } = useAuth();

  // Mientras se resuelve la sesión (arranque o validación del código) mostramos
  // la pantalla de carga de marca en lugar de un lienzo en blanco.
  if (loading) return <BrandLoader />;

  return (
    <>
      <NavigationContainer>
        {/* `cardStyle` es el estilo que @react-navigation/stack le pone a la "card" de
            cada pantalla (`contentStyle`), y sin él la card se queda con `flex: 0 0 auto`:
            su alto es el de su CONTENIDO, no el de la ventana. En el chat de una
            conversación larga eso empujaba la barra de escribir fuera de la pantalla
            (medido en el chat real: barra en y=1127 con la ventana de 718, y el documento
            entero desplazándose 417 px de más). Con `flex: 1` la card mide el alto de la
            ventana —igual que su propio estilo `card` cuando no "llena" la pantalla— y
            lo que se desplaza es la lista de mensajes (medido: barra en 710, documento en
            0, y la lista con 463 px de alto y 880 de contenido). */}
        <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { flex: 1 } }}>
          {!session ? (
            <>
              <Stack.Screen name="Splash" component={SplashScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
            </>
          ) : requiresProfileSetup ? (
            <>
              <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
              <Stack.Screen
                name="PaymentDetails"
                component={PaymentDetailsScreen}
                options={{ headerShown: false }}
              />
            </>
          ) : (
            <>
              <Stack.Screen name="Main" component={HomeScreen} />
              <Stack.Screen
                name="ProfileSetup"
                component={ProfileSetupScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="CreateServiceAlert"
                component={CreateServiceAlertScreen}
                options={{ headerShown: true, title: 'Nueva alerta' }}
              />
              <Stack.Screen
                name="CreateService"
                component={CreateServiceScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="SelectGroupsForService"
                component={SelectGroupsForServiceScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="CreateGroup"
                component={CreateGroupScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="GroupMembers"
                component={GroupMembersScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="AddParticipant"
                component={AddParticipantScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="ApplicantsScreen"
                component={ApplicantsScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
              <Stack.Screen
                name="GroupChat"
                component={GroupChatScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="ParticipantDetail"
                component={ParticipantDetailScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="PaymentDetails"
                component={PaymentDetailsScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="MyServices"
                component={MyServicesScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Estadisticas"
                component={EstadisticasScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Navegacion"
                component={NavegacionScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Privacy"
                component={PrivacyScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="BlockedDrivers"
                component={BlockedDriversScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="BlockedProviders"
                component={BlockedProvidersScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="BlockedUserProfile"
                component={BlockedUserProfileScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="AppLock"
                component={AppLockScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Membership"
                component={MembershipScreen}
                options={{ headerShown: false }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <AlertHost />
    </>
  );
}
