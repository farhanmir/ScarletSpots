import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, authApiCall } from '@/shared/api/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NB_CAMPUS_NAMES } from '@/shared/constants/lots';

// ── Permit preference helpers ─────────────────────────────────────────────

export type CustomLotFilter = Set<'student' | 'employee' | 'gated' | 'ev'>;
export type NoPermitMode = 'commuter_all' | 'all' | null;

/** Parse the raw `permit_type` string stored in the DB into structured state. */
function parsePermitPreference(raw: string | null): {
  permitType: string | null;
  noPermitMode: NoPermitMode;
  customLotFilter: CustomLotFilter;
} {
  if (!raw) {
    return { permitType: null, noPermitMode: null, customLotFilter: new Set() };
  }
  if (raw === '__commuter_all') {
    return { permitType: raw, noPermitMode: 'commuter_all', customLotFilter: new Set() };
  }
  if (raw === '__all') {
    return { permitType: raw, noPermitMode: 'all', customLotFilter: new Set() };
  }
  return { permitType: raw, noPermitMode: null, customLotFilter: new Set() };
}

// ── Context type ──────────────────────────────────────────────────────────

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;

  /** Raw permit_type string as stored in the DB (or null if not set). */
  permitType: string | null;
  /**
   * 'commuter_all' → show union of all commuter lots.
   * 'custom'       → show lots matching customLotFilter attributes.
   * null           → permitType is a real permit name (or not configured).
   */
  noPermitMode: NoPermitMode;
  /** Active when noPermitMode === 'custom'. */
  customLotFilter: CustomLotFilter;
  /**
   * Save a permit preference and update context immediately.
   * Pass null to clear the preference.
   */
  setPermitPreference: (raw: string | null) => Promise<void>;

  /** Set of campus names that are enabled for display. */
  enabledCampuses: Set<string>;
  /** Toggle a campus on or off. */
  toggleCampus: (campus: string) => void;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  permitType: null,
  noPermitMode: null,
  customLotFilter: new Set(),
  setPermitPreference: async () => {},
  enabledCampuses: new Set(NB_CAMPUS_NAMES),
  toggleCampus: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [permitType, setPermitType] = useState<string | null>(null);
  const [noPermitMode, setNoPermitMode] = useState<NoPermitMode>(null);
  const [customLotFilter, setCustomLotFilter] = useState<CustomLotFilter>(new Set());

  // ── Campus filter ──
  const [enabledCampuses, setEnabledCampuses] = useState<Set<string>>(new Set(NB_CAMPUS_NAMES));

  // Load saved campus preferences from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem('enabled_campuses').then(raw => {
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setEnabledCampuses(new Set(arr));
        } catch {}
      }
    });
  }, []);

  const toggleCampus = useCallback((campus: string) => {
    setEnabledCampuses(prev => {
      const next = new Set(prev);
      if (next.has(campus)) {
        // Don't allow disabling all campuses
        if (next.size > 1) next.delete(campus);
      } else {
        next.add(campus);
      }
      AsyncStorage.setItem('enabled_campuses', JSON.stringify([...next]));
      return next;
    });
  }, []);

  /** Apply parsed permit state from a raw DB string. */
  const applyPermitRaw = useCallback((raw: string | null) => {
    const parsed = parsePermitPreference(raw);
    setPermitType(parsed.permitType);
    setNoPermitMode(parsed.noPermitMode);
    setCustomLotFilter(parsed.customLotFilter);
  }, []);

  /** Fetch the user's profile and hydrate permit state. */
  const loadProfile = useCallback(async () => {
    try {
      const profile = await authApiCall('/users/me');
      if (profile?.permit_type !== undefined) {
        applyPermitRaw(profile.permit_type);
      }
    } catch {
      // Profile fetch failing should not block auth — leave permit as null
    }
  }, [applyPermitRaw]);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Load profile (and permit_type) whenever a session appears
  useEffect(() => {
    if (session) {
      loadProfile();
    } else {
      // Clear permit state on sign-out
      applyPermitRaw(null);
    }
  }, [session, loadProfile, applyPermitRaw]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const setPermitPreference = useCallback(async (raw: string | null) => {
    applyPermitRaw(raw);
    try {
      await authApiCall('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ permit_type: raw }),
      });
    } catch {
      console.warn('[AuthProvider] Failed to save permit_type to backend');
    }
  }, [applyPermitRaw]);

  return (
    <AuthContext.Provider value={{
      session,
      user,
      loading,
      signOut,
      permitType,
      noPermitMode,
      customLotFilter,
      setPermitPreference,
      enabledCampuses,
      toggleCampus,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

