import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

interface Profile {
  id: string;
  phone: string;
  role?: string;
  full_name?: string;
  vehicle_data?: any;
  yape_number?: string;
  bcp_account?: string;
}

interface AuthContextData {
  session: any | null;
  profile: Profile | null;
  loading: boolean;
  requiresProfileSetup: boolean;
  requireSmsVerification: boolean;
  signIn: (phone: string, otp: string) => Promise<boolean>;
  requestOtp: (phone: string) => Promise<boolean>;
  completeProfileSetup: (updates?: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);
const PHONE_KEY = '@whatsremisse_phone';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresProfileSetup, setRequiresProfileSetup] = useState(false);
  const [phone, setPhone] = useState('');

  const requireSmsVerification = false; // Modo desarrollo activo

  async function loadProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        setProfile(null);
        setRequiresProfileSetup(true);
        return;
      }

      if (data) {
        const mapped: Profile = {
          id: data.id,
          phone: data.phone || '',
          role: data.role,
          full_name: data.full_name,
          vehicle_data: data.vehicle_data,
          yape_number: data.yape_number,
          bcp_account: data.bcp_account,
        };
        setProfile(mapped);
        const isProfileComplete = Boolean(mapped.role && mapped.full_name && mapped.vehicle_data);
        // eslint-disable-next-line no-console
        console.log('[Auth] Perfil cargado:', mapped, 'isProfileComplete:', isProfileComplete);
        setRequiresProfileSetup(!isProfileComplete);
      } else {
        setRequiresProfileSetup(true);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Auth] Error cargando perfil:', err);
      setProfile(null);
      setRequiresProfileSetup(true);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user) {
          await loadProfile(data.session.user.id);
        }
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setLoading(true);
      setSession(newSession);
      if (newSession?.user) {
        await loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setRequiresProfileSetup(false);
      }
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signInWithoutOtp = async (normalizedPhone: string): Promise<boolean> => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        phone: normalizedPhone,
        password: 'default-password-placeholder',
      });

      if (authError || !authData.session) {
        // Si no existe, simulamos sesión local o usuario mock para pruebas
        const mockUser = { id: 'mock-user-id-123', phone: normalizedPhone };
        setSession({ user: mockUser });
        await loadProfile(mockUser.id);
        return true;
      }

      setSession(authData.session);
      await loadProfile(authData.session.user.id);
      return true;
    } catch (err) {
      // Fallback a perfil vacío para forzar onboarding si falla la red
      setRequiresProfileSetup(true);
      return true;
    }
  };

  const signIn = async (inputPhone: string, otp: string): Promise<boolean> => {
    const normalizedPhone = inputPhone.startsWith('+') ? inputPhone : `+51${inputPhone.trim()}`;
    setPhone(normalizedPhone);
    await AsyncStorage.setItem(PHONE_KEY, normalizedPhone);

    setLoading(true);
    try {
      if (!requireSmsVerification) {
        return await signInWithoutOtp(normalizedPhone);
      }

      const { error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: otp,
        type: 'sms',
      });

      if (error) return false;

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSession(data.session);
        await loadProfile(data.session.user.id);
        return true;
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const completeProfileSetup = async (updates?: Partial<Profile>) => {
    if (profile) {
      const updated = { ...profile, ...updates };
      setProfile(updated);
      const isComplete = Boolean(updated.role && updated.full_name && updated.vehicle_data);
      setRequiresProfileSetup(!isComplete);
    }
  };

  const requestOtp = async (inputPhone: string): Promise<boolean> => {
    const normalizedPhone = inputPhone.startsWith('+') ? inputPhone : `+51${inputPhone.trim()}`;
    setPhone(normalizedPhone);
    await AsyncStorage.setItem(PHONE_KEY, normalizedPhone);

    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
    });
    return !error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setRequiresProfileSetup(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        requiresProfileSetup,
        requireSmsVerification,
        signIn,
        requestOtp,
        completeProfileSetup,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
