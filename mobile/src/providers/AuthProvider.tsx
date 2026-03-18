import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { LogtoProvider, useLogto } from "@logto/rn";
import { logtoConfig } from "@/shared/api/logto";
import { fetchBackend, safeJson } from "@/shared/api/api-base";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NB_CAMPUS_NAMES } from "@/shared/constants/lots";
import {
  clearPushTokenFromBackend,
  syncPushTokenToBackend,
} from "@/shared/services/PushRegistration";

// ── Permit preference helpers ─────────────────────────────────────────────

export type CustomLotFilter = Set<"student" | "employee" | "gated" | "ev">;
export type NoPermitMode = "commuter_all" | "all" | null;

function parsePermitPreference(raw: string | null): {
  permitType: string | null;
  noPermitMode: NoPermitMode;
  customLotFilter: CustomLotFilter;
} {
  if (!raw) {
    return { permitType: null, noPermitMode: null, customLotFilter: new Set() };
  }
  if (raw === "__commuter_all") {
    return {
      permitType: raw,
      noPermitMode: "commuter_all",
      customLotFilter: new Set(),
    };
  }
  if (raw === "__all") {
    return { permitType: raw, noPermitMode: "all", customLotFilter: new Set() };
  }
  return { permitType: raw, noPermitMode: null, customLotFilter: new Set() };
}

// ── Context type ──────────────────────────────────────────────────────────

type AuthContextType = {
  isAuthenticated: boolean;
  loading: boolean;
  user: any;
  session: any;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdTokenClaims: () => Promise<any>;
  getAccessToken: (resource?: string) => Promise<string | undefined>;

  permitType: string | null;
  secondaryPermitType: string | null;
  noPermitMode: NoPermitMode;
  customLotFilter: CustomLotFilter;
  setPermitPreference: (raw: string | null) => Promise<void>;
  setSecondaryPermitPreference: (raw: string | null) => Promise<void>;

  enabledCampuses: Set<string>;
  toggleCampus: (campus: string) => void;
};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  loading: true,
  user: null,
  session: null,
  signIn: async () => {},
  signOut: async () => {},
  getIdTokenClaims: async () => ({}),
  getAccessToken: async () => undefined,
  permitType: null,
  secondaryPermitType: null,
  noPermitMode: null,
  customLotFilter: new Set(),
  setPermitPreference: async () => {},
  setSecondaryPermitPreference: async () => {},
  enabledCampuses: new Set(NB_CAMPUS_NAMES),
  toggleCampus: () => {},
});

export const useAuth = () => useContext(AuthContext);

/**
 * Global getter for access tokens.
 * Allows non-hook functions (like authApiCall) to retrieve a valid token.
 */
export let getAccessTokenSilently: () => Promise<string | undefined> = async () => undefined;

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const {
    isAuthenticated,
    isInitialized,
    signIn: logtoSignIn,
    signOut: logtoSignOut,
    getIdTokenClaims,
    getAccessToken,
  } = useLogto();

  const loading = !isInitialized;

  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then((claims) => {
        setUser(claims);
        setSession(claims);
      });
    } else {
      setUser(null);
      setSession(null);
    }
  }, [isAuthenticated, getIdTokenClaims]);

  // Sync the global getter
  useEffect(() => {
    getAccessTokenSilently = getAccessToken;
  }, [getAccessToken]);

  const [permitType, setPermitType] = useState<string | null>(null);
  const [secondaryPermitType, setSecondaryPermitType] = useState<string | null>(
    null,
  );
  const [noPermitMode, setNoPermitMode] = useState<NoPermitMode>(null);
  const [customLotFilter, setCustomLotFilter] = useState<CustomLotFilter>(
    new Set(),
  );

  const [enabledCampuses, setEnabledCampuses] = useState<Set<string>>(
    new Set(NB_CAMPUS_NAMES),
  );

  useEffect(() => {
    AsyncStorage.getItem("enabled_campuses").then((raw) => {
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setEnabledCampuses(new Set(arr));
        } catch {}
      }
    });
    AsyncStorage.getItem("secondary_permit_type").then((raw) => {
      if (raw) setSecondaryPermitType(raw);
    });
  }, []);

  const toggleCampus = useCallback((campus: string) => {
    setEnabledCampuses((prev) => {
      const next = new Set(prev);
      if (next.has(campus)) {
        if (next.size > 1) next.delete(campus);
      } else {
        next.add(campus);
      }
      AsyncStorage.setItem("enabled_campuses", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const applyPermitRaw = useCallback((raw: string | null) => {
    const parsed = parsePermitPreference(raw);
    setPermitType(parsed.permitType);
    setNoPermitMode(parsed.noPermitMode);
    setCustomLotFilter(parsed.customLotFilter);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      
      const response = await fetchBackend("/users/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const profile = await safeJson(response);
      if (profile?.permit_type !== undefined) {
        applyPermitRaw(profile.permit_type);
      }
    } catch {
      // Profile fetch failing should not block auth
    }
  }, [applyPermitRaw, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) {
      loadProfile();
      syncPushTokenToBackend();
    } else {
      applyPermitRaw(null);
      clearPushTokenFromBackend();
    }
  }, [isAuthenticated, loadProfile, applyPermitRaw]);

  const signIn = async () => {
    await logtoSignIn("com.scarletspots.app://callback");
  };

  const signOut = async () => {
    await logtoSignOut();
  };

  const setPermitPreference = useCallback(
    async (raw: string | null) => {
      applyPermitRaw(raw);
      try {
        const token = await getAccessToken();
        await fetchBackend("/users/me", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ permit_type: raw }),
        });
      } catch {
        console.warn("[AuthProvider] Failed to save permit_type to backend");
      }
    },
    [applyPermitRaw, getAccessToken],
  );

  const setSecondaryPermitPreference = useCallback(
    async (raw: string | null) => {
      setSecondaryPermitType(raw);
      if (raw === null) {
        await AsyncStorage.removeItem("secondary_permit_type");
      } else {
        await AsyncStorage.setItem("secondary_permit_type", raw);
      }
    },
    [],
  );

  const contextValue = useMemo(
    () => ({
      isAuthenticated,
      loading,
      user,
      session,
      signIn,
      signOut,
      getIdTokenClaims,
      getAccessToken,
      permitType,
      secondaryPermitType,
      noPermitMode,
      customLotFilter,
      setPermitPreference,
      setSecondaryPermitPreference,
      enabledCampuses,
      toggleCampus,
    }),
    [
      isAuthenticated,
      loading,
      user,
      session,
      signIn,
      signOut,
      getIdTokenClaims,
      getAccessToken,
      permitType,
      secondaryPermitType,
      noPermitMode,
      customLotFilter,
      setPermitPreference,
      setSecondaryPermitPreference,
      enabledCampuses,
      toggleCampus,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <LogtoProvider config={logtoConfig}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </LogtoProvider>
  );
}
