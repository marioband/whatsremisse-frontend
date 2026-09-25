import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, AuthError } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

import { usuarioParaPintarSinRed, debeTaparConElLogo } from '../lib/arranque';
import { configurarAlmacen, limpiarCacheCompleta } from '../lib/cache';
import { candidatosDeCelular } from '../lib/celular';
import { supabase } from '../lib/supabase';
import { configurarModoDePruebasPremium } from '../lib/premium';
import { Profile } from '../types';

// El almacén del dispositivo se registra una sola vez al cargar la app: es lo que
// usa la caché persistente de rutas (sobrevive a recargar la aplicación).
configurarAlmacen(AsyncStorage as never);

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
  /**
   * Vuelve a leer el perfil de la base (0042: al activar las emergencias, el servidor tiene que
   * ver la marca puesta; y la app, reflejarla). `loadProfile` ya hacía el trabajo.
   */
  refrescarPerfil: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PHONE_KEY = '@whatsremisse_phone';
/**
 * El perfil guardado en el dispositivo.
 *
 * Por qué: al volver de Waze (o de cualquier app), iOS puede descartar la pestaña y recargarla.
 * El arranque esperaba a `getSession()` Y a la consulta del perfil para quitar el logo de carga,
 * así que con la red fría el usuario veía 15 segundos de pantalla de carga (reporte del
 * 19-09-2026). Con el perfil guardado, la app PINTA ENSEGUIDA lo que ya sabía y refresca por
 * detrás; el perfil de verdad llega un momento después y manda.
 */
const PERFIL_KEY = '@whatsremisse_perfil';

/**
 * Quién había iniciado sesión (solo el id del usuario), para poder PINTAR al instante al volver
 * a la app (20-09-2026).
 *
 * POR QUÉ: `supabase.auth.getSession()` no siempre responde con lo guardado; cuando el token ya
 * venció —justo lo que pasa al volver de otra app— tiene que ir a la red a refrescarlo, y hasta
 * que eso termina el arranque se quedaba en el logo de carga. Con el id guardado, la app entra
 * con lo que ya sabía y la sesión de verdad manda en cuanto llega (si de verdad no hay sesión,
 * porque se cerró en otro sitio o venció sin remedio, se vuelve al inicio de sesión).
 */
const SESION_KEY = '@whatsremisse_usuario';

const requireSmsVerification = process.env.EXPO_PUBLIC_REQUIRE_SMS_VERIFICATION !== 'false';

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: row.email ? String(row.email) : '',
    full_name: row.full_name ? String(row.full_name) : null,
    phone: row.phone ? String(row.phone) : null,
    role: (row.role as Profile['role']) || 'DRIVER',
    group_id: null,
    // La membresía vive en `profiles.tier` (migración 0008). Si la columna no
    // existe todavía, `esPremium` la trata como premium en esta etapa de pruebas.
    tier: (row.tier as Profile['tier']) || 'PREMIUM',
    subscription_expires_at: row.subscription_expires_at
      ? String(row.subscription_expires_at)
      : null,
    current_debt: 0,
    vehicle_data: (row.vehicle_data as Profile['vehicle_data']) || null,
    license_data: (row.license_data as Profile['license_data']) || null,
    yape_number: row.yape_number ? String(row.yape_number) : null,
    bcp_account: row.bcp_account ? String(row.bcp_account) : null,
    bcp_cci: row.bcp_cci ? String(row.bcp_cci) : null,
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
        const [savedPhone, perfilGuardado, usuarioGuardado] = await Promise.all([
          AsyncStorage.getItem(PHONE_KEY),
          AsyncStorage.getItem(PERFIL_KEY),
          AsyncStorage.getItem(SESION_KEY),
        ]);
        if (savedPhone && mounted) setPhone(savedPhone);

        // Lo que ya sabemos del perfil se pinta ENSEGUIDA: el usuario no espera a la red para
        // ver su app (antes, con la red fría, esto eran ~15 s de logo).
        if (perfilGuardado && mounted) {
          try {
            const guardado = JSON.parse(perfilGuardado);
            setProfile(guardado);
            setRequiresProfileSetup(
              !(guardado?.role && guardado?.full_name && guardado?.vehicle_data)
            );
          } catch {
            // Caché ilegible: se sigue con la consulta de verdad.
          }
        }

        // Y la app ARRANCA con la sesión que ya conocía: nada de logo de carga mientras la red
        // refresca el token (la «carga al volver» que reportó el usuario el 20-09-2026). Lo que
        // llegue de `getSession()` después manda: si no hay sesión, se vuelve a iniciar sesión.
        const idParaPintar = usuarioParaPintarSinRed(perfilGuardado, usuarioGuardado);
        if (idParaPintar && mounted) {
          setSession({ user: { id: idParaPintar } } as unknown as Session);
          setLoading(false);
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (mounted && data.session) {
          setSession(data.session);
          // El refresco del perfil NO bloquea el arranque: si la red tarda, la app ya está
          // pintada con lo guardado.
          setLoading(false);
          await loadProfile(data.session.user.id);
        }
      } catch (err) {
        console.error('[Auth] initSession error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (evento, newSession) => {
      if (!mounted) return;
      // Solo se tapa la pantalla con el logo cuando se ENTRA o se SALE de verdad. Supabase
      // dispara `TOKEN_REFRESHED` justo cuando la app vuelve después de un rato (el token venció
      // mientras estaba fuera): poner el logo en ese momento era la «carga al volver» que
      // reportó el usuario el 20-09-2026 (ver `lib/arranque`).
      if (debeTaparConElLogo(evento)) setLoading(true);
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
        // Se guarda para el próximo arranque (el de la vuelta de Waze): el perfil y QUIÉN es,
        // que es lo que permite entrar pintando sin esperar a la red.
        void AsyncStorage.setItem(PERFIL_KEY, JSON.stringify(mapped)).catch(() => undefined);
        AsyncStorage.setItem(SESION_KEY, mapped.id).catch(() => undefined);
        const isProfileComplete = Boolean(mapped.role && mapped.full_name && mapped.vehicle_data);
        // eslint-disable-next-line no-console
        console.log('[Auth] Perfil cargado:', mapped, 'isProfileComplete:', isProfileComplete);
        setRequiresProfileSetup(!isProfileComplete);
        // El interruptor «modo pruebas / modo real» (0046): dice si las funciones de pago son de
        // todos o solo de quien tiene membresía activa. No se espera (no puede retrasar el arranque).
        void aplicarModoDePruebas();
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

  const refrescarPerfil = async () => {
    const actual = session?.user?.id;
    if (!actual) return;
    await loadProfile(actual);
  };

  /**
   * Lee el interruptor «modo pruebas / modo real» de la base (0046) y lo deja puesto.
   *
   * Si no se puede leer (migración sin aplicar, sin red), se queda como estaba: en modo pruebas.
   * Una migración que falta no puede dejar a nadie sin las funciones de pago.
   */
  const aplicarModoDePruebas = async () => {
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('premium_para_todos')
        .maybeSingle();
      if (error) throw error;
      const valor = (data as { premium_para_todos?: boolean } | null)?.premium_para_todos;
      if (typeof valor === 'boolean') configurarModoDePruebasPremium(valor);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Auth] no se pudo leer el modo de pruebas (¿falta aplicar 0046_panel_de_administracion.sql?); se queda encendido:',
        err
      );
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
    // El número es también la contraseña, así que se prueban TODAS sus formas antes de crear nada:
    // las cuentas de antes del 22-09-2026 están guardadas sin el código de país (999888777) y las
    // nuevas con él (+51999888777). Sin esta vuelta, la primera forma que no coincidiera crearía una
    // cuenta nueva y vacía, y esa persona perdería sus servicios y sus grupos.
    for (const candidato of candidatosDeCelular(inputPhone)) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        phone: candidato,
        password: candidato,
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

      // Cualquier otro fallo (401 del gateway de Supabase, red caída, etc.) debe
      // llegar a la pantalla con su mensaje real en lugar de devolver un error
      // genérico que oculta la causa.
      if (!isInvalidCredentialsError(signInError)) throw signInError;
    }

    // Ninguna forma existe: la cuenta es nueva, y se crea ya con el formato nuevo (con el código).
    const nuevo = candidatosDeCelular(inputPhone)[0];
    const { error: signUpError } = await supabase.auth.signUp({
      phone: nuevo,
      password: nuevo,
    });

    if (signUpError) throw signUpError;

    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setSession(data.session);
      await loadProfile(data.session.user.id);
      return true;
    }

    throw new Error(
      'El registro no devolvió sesión: el proyecto exige confirmación por SMS. ' +
        'Activa GOTRUE_SMS_AUTOCONFIRM o configura un proveedor de SMS en el stack de Supabase.'
    );
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

    const payload: Record<string, unknown> = {
      id: session.user.id,
      phone: nextProfile.phone,
      role: nextProfile.role,
      full_name: nextProfile.full_name,
      vehicle_data: nextProfile.vehicle_data,
      license_data: nextProfile.license_data,
    };

    // No pisar los datos de pago con null cuando esta actualización no los trae.
    if (nextProfile.yape_number !== undefined) payload.yape_number = nextProfile.yape_number;
    if (nextProfile.bcp_account !== undefined) payload.bcp_account = nextProfile.bcp_account;
    if (nextProfile.bcp_cci !== undefined) payload.bcp_cci = nextProfile.bcp_cci;

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
    await AsyncStorage.removeItem(PERFIL_KEY);
    // Si se cierra sesión, no puede quedar el id guardado: la próxima vez se entra por la
    // pantalla de inicio de sesión, no pintando la app de alguien que ya no está.
    await AsyncStorage.removeItem(SESION_KEY);
    // Y la caché de datos (grupos, servicios, postulaciones) no se queda en el teléfono de
    // quien cerró sesión: era su información.
    limpiarCacheCompleta().catch(() => undefined);
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
        refrescarPerfil,
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
