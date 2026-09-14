import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';

import { useAuth } from '../context/AuthContext';
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
import { GroupChatScreen } from '../screens/GroupChatScreen';
import { GroupMembersScreen } from '../screens/GroupMembersScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MembershipScreen } from '../screens/MembershipScreen';
import { MyServicesScreen } from '../screens/MyServicesScreen';
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
  SelectGroupsForService: { draftService: ServiceAlert };
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

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
          </>
        ) : requiresProfileSetup ? (
          <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
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
  );
}
