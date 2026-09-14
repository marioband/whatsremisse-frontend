import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, AuthError } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

import { supabase } from '../lib/supabase';
import { Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  requiresProfileSetup: boolean;
  phone: string | null;
  requireSmsVerification: boolean;
  requestOtp: (phone: string) => Promise<void>;
  signIn: (phone: string, otp: string) => Promise<boolean>;
  completeProfileSetup: (updates?: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PHONE_KEY = '@whatsremisse_phone';

const requireSmsVerification = process.env.EXPO_PUBLIC_REQUIRE_SMS_VERIFICATION !== 'false';

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: row.email ? String(row.email) : '',
    full_name: row.full_name ? String(row.full_name) : null,
    phone: row.phone ? String(row.phone) : null,
    role: (row.role as Profile['role']) || 'DRIVER',
    group_id: null,
    tier: 'PREMIUM',
    subscription_expires_at: null,
    current_debt: 0,
    vehicle_data: (row.vehicle_data as Profile['vehicle_data']) || null,
    license_data: (row.license_data as Profile['license_data']) || null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresProfileSetup, setRequiresProfileSetup] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      try {
        const savedPhone = await AsyncStorage.getItem(PHONE_KEY);
        if (savedPhone && mounted) setPhone(savedPhone);

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (mounted && data.session) {
          setSession(data.session);
          await loadProfile(data.session.user.id);
        }
      } catch (err) {
        console.error('[Auth] initSession error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initSession();

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

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      if (data) {
        const mapped = mapProfile(data);
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
  };

  const requestOtp = async (inputPhone: string) => {
    setPhone(inputPhone);
    await AsyncStorage.setItem(PHONE_KEY, inputPhone);

    if (!requireSmsVerification) return;

    const { error } = await supabase.auth.signInWithOtp({ phone: inputPhone });
    if (error) throw error;
  };

  const signInWithoutOtp = async (inputPhone: string): Promise<boolean> => {
    const password = inputPhone;

    const { error: signInError } = await supabase.auth.signInWithPassword({
      phone: inputPhone,
      password,
    });

    if (!signInError) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSession(data.session);
        await loadProfile(data.session.user.id);
        return true;
      }
      return false;
    }

    // Si el usuario no existe, lo creamos automáticamente
    if (isInvalidCredentialsError(signInError)) {
      const { error: signUpError } = await supabase.auth.signUp({
        phone: inputPhone,
        password,
      });

      if (signUpError) throw signUpError;

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSession(data.session);
        await loadProfile(data.session.user.id);
        return true;
      }
    }

    return false;
  };

  const signIn = async (inputPhone: string, otp: string): Promise<boolean> => {
    const normalizedPhone = inputPhone || phone || '';
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
    if (!session?.user) {
      // eslint-disable-next-line no-console
      console.error('[Auth] completeProfileSetup: no hay sesión');
      return;
    }

    const nextProfile: Profile = {
      ...(profile || {
        id: session.user.id,
        email: '',
        full_name: null,
        phone: phone || null,
        role: 'DRIVER',
        group_id: null,
        tier: 'PREMIUM',
        subscription_expires_at: null,
        current_debt: 0,
        vehicle_data: null,
        license_data: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      ...updates,
      id: session.user.id,
      updated_at: new Date().toISOString(),
    };

    const payload = {
      id: session.user.id,
      phone: nextProfile.phone,
      role: nextProfile.role,
      full_name: nextProfile.full_name,
      vehicle_data: nextProfile.vehicle_data,
      license_data: nextProfile.license_data,
    };

    // eslint-disable-next-line no-console
    console.log('[Auth] completeProfileSetup payload:', payload);

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .maybeSingle();
    // eslint-disable-next-line no-console
    console.log('[Auth] completeProfileSetup existing profile:', existing);

    const { error } = await supabase.from('profiles').upsert(payload);

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[Auth] completeProfileSetup upsert error:', error);
      throw error;
    }

    setProfile(nextProfile);
    setRequiresProfileSetup(false);
  };

  const signOut = async () => {
    await AsyncStorage.removeItem(PHONE_KEY);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setPhone(null);
    setRequiresProfileSetup(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        requiresProfileSetup,
        phone,
        requireSmsVerification,
        requestOtp,
        signIn,
        completeProfileSetup,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function isInvalidCredentialsError(error: AuthError): boolean {
  return (
    error.message.toLowerCase().includes('invalid login credentials') ||
    error.message.toLowerCase().includes('user not found') ||
    error.status === 400
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
