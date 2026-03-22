import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Platform,
  Alert,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  Linking,
  useColorScheme,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import MapView, {
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
  Polygon,
  Marker,
  type Region,
} from "react-native-maps";
import { useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import NetInfo from "@react-native-community/netinfo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TrueSheet, type TrueSheetRef } from "@lodev09/react-native-true-sheet";
import { authApiCall, publicApiCall } from "@/shared/api/supabase";
import { WEBSOCKET_BASE_URL } from "@/shared/api/api-base";
import { useAuth } from "@/providers/AuthProvider";
import ParkingConfirmationSheet from "../components/ParkingConfirmationSheet";
import LotDetailsSheetContent from "../components/LotDetailsSheetContent";
import CandidatePin from "../components/Map/CandidatePin";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import {
  getPendingParkingCandidates,
  clearPendingParkingCandidates,
} from "@/shared/services/BackgroundTasks";
import { type ParkingCandidate } from "@/shared/services/ParkingDetectionService";
import {
  fetchWithOfflineFallback,
  clearCachedSession,
  cacheSession,
  cacheFavorites,
  getCachedFavorites,
} from "@/shared/services/OfflineCache";
import { queueParkAction } from "@/shared/services/OfflineQueue";
import {
  getAllLots,
  applyOccupancy,
  getPermitLotIdsUnion,
  ALL_COMMUTER_LOT_IDS,
  isLotAvailableNow,
  isSecondaryPermitAvailableNow,
  type RutgersLot,
} from "@/shared/constants/lots";
import { ENABLE_ALL_CAMPUSES } from "@/shared/constants/featureFlags";
import { GlassBackground } from "@/shared/components/ui/GlassBackground";
import { createAuthedWebSocket } from "@/shared/services/authedWebSocket";

// ── Types ──────────────────────────────────────────────────────────────────

interface ParkingSession {
  id: string;
  lotId: string;
  startTime: string;
  endTime?: string;
  latitude?: number | null;
  longitude?: number | null;
  autoStarted?: boolean;
}

type ZoomLevel = "lot" | "campus" | "hidden";
const LOT_TAP_SNAP_RADIUS_METERS = 110;

interface Cluster {
  id: string;
  type: "campus" | "region";
  name: string;
  latitude: number;
  longitude: number;
  occupancyRate: number;
  count: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const getOccupancyColor = (rate: number) => {
  if (rate >= 90) return { full: "#ef4444", bg: "rgba(239, 68, 68, 0.6)" };
  if (rate >= 70) return { full: "#f59e0b", bg: "rgba(245, 158, 11, 0.6)" };
  return { full: "#10b981", bg: "rgba(16, 185, 129, 0.6)" };
};

const getClusterColor = (rate: number) => {
  if (rate > 80) return "#ef4444";
  if (rate > 50) return "#f59e0b";
  return "#059669";
};

function applyRealtimeOccupancyCount(
  lots: RutgersLot[] | undefined,
  lotId: string,
  count: number,
): RutgersLot[] | undefined {
  if (!lots) return lots;
  return lots.map((lot) => {
    if (lot.id !== lotId) return lot;
    return {
      ...lot,
      occupiedCount: count,
      occupancyRate:
        lot.capacity > 0 ? Math.min(100, (count / lot.capacity) * 100) : 0,
    };
  });
}

/** Haversine distance in meters. */
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Bearing from (lat1,lon1) to (lat2,lon2) in degrees 0–360. */
function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  let b = (Math.atan2(y, x) * 180) / Math.PI + 360;
  return b % 360;
}

function isRegionCenteredOnLocation(
  region: Region,
  coords: Pick<Location.LocationObjectCoords, "latitude" | "longitude">,
): boolean {
  const latitudeTolerance = Math.max(region.latitudeDelta * 0.15, 0.00035);
  const longitudeTolerance = Math.max(region.longitudeDelta * 0.15, 0.00035);

  return (
    Math.abs(region.latitude - coords.latitude) <= latitudeTolerance &&
    Math.abs(region.longitude - coords.longitude) <= longitudeTolerance
  );
}

// ── Static lot base (from bundled JSON, no API call) ──────────────────────
// Computed once at module load — never re-fetched unless the app updates.
const STATIC_LOTS = getAllLots(ENABLE_ALL_CAMPUSES);

// ── Component ──────────────────────────────────────────────────────────────

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== "light";
  const {
    user,
    session,
    permitType,
    secondaryPermitType,
    noPermitMode,
    enabledCampuses,
  } = useAuth();
  const queryClient = useQueryClient();
  const mapRef = useRef<MapView>(null);
  const params = useLocalSearchParams();
  const currentUserId = user?.id ?? null;

  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("campus");
  const [pendingCandidates, setPendingCandidates] = useState<
    ParkingCandidate[]
  >([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isCenterButtonPressed, setIsCenterButtonPressed] = useState(false);
  const [isCenteredOnUser, setIsCenteredOnUser] = useState(false);
  const [chipUserPosition, setChipUserPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [chipHeading, setChipHeading] = useState<number | null>(null);

  // ── Animations ────────────────────────────────────────────────────────

  const centerButtonScale = useSharedValue(1);

  const centerButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: centerButtonScale.value }],
  }));

  // Keep track of the last selected lot for smooth exit animations
  const lastSelectedLotRef = useRef<RutgersLot | null>(null);
  const lotSheetRef = useRef<TrueSheetRef>(null);
  const [isLotSheetVisible, setIsLotSheetVisible] = useState(false);

  const isFocused = useIsFocused();

  // ── Occupancy Data (from Supabase lot_occupancy table) ────────────────
  //
  // Lot metadata (names, polygons, capacity) comes from the bundled JSON.
  // Only the live occupancy count is fetched from the backend — one small
  // query that returns a flat list of {lot_id, count} rows.
  //
  const { data: lots = STATIC_LOTS } = useQuery<RutgersLot[]>({
    queryKey: ["lots_occupancy"],
    queryFn: async () => {
      try {
        const data = await publicApiCall("/lots/occupancy");
        const rows = Array.isArray(data?.occupancy) ? data.occupancy : [];

        const occupancyMap: Record<string, number> = {};
        for (const row of rows) {
          occupancyMap[row.lot_id] = row.count ?? 0;
        }
        return applyOccupancy(getAllLots(ENABLE_ALL_CAMPUSES), occupancyMap);
      } catch {
        // If the query fails, return static data with 0 occupancy
        return STATIC_LOTS.map((l) => ({ ...l }));
      }
    },
    staleTime: 1000 * 60 * 2,
    // Fallback for builds where websocket is not connected yet.
    refetchInterval: isFocused ? 1000 * 15 : false,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    initialData: STATIC_LOTS.map((l) => ({ ...l })),
  });

  useEffect(() => {
    if (!session) return;

    const disconnect = createAuthedWebSocket({
      endpoint: `${WEBSOCKET_BASE_URL}/ws/occupancy`,
      authPayload: { lot_ids: STATIC_LOTS.map((lot) => lot.id) },
      onMessage: (payload) => {
        if (payload.type !== "occupancy_update") return;
        const lotIdRaw = payload.lot_id;
        if (typeof lotIdRaw !== "string" || !lotIdRaw) return;
        const lotId = lotIdRaw;
        const count = Number(payload.count ?? 0);

        queryClient.setQueryData(
          ["lots_occupancy"],
          (old: RutgersLot[] | undefined) =>
            applyRealtimeOccupancyCount(old, lotId, count),
        );
      },
    });

    return () => {
      disconnect();
    };
  }, [session, queryClient]);

  // ── Active Session ─────────────────────────────────────────────────────

  const { data: sessionData } = useQuery<{ session: ParkingSession | null }>({
    queryKey: ["session", "active"],
    queryFn: async () => {
      const result = await fetchWithOfflineFallback(
        async () => {
          const data = await authApiCall("/park/session/active");
          return data;
        },
        "offline_cache_session",
        1000 * 60 * 1,
        currentUserId,
      );
      return result.data ?? { session: null };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2.5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const activeSession = sessionData?.session ?? null;

  useEffect(() => {
    if (!location || !regionRef.current) {
      setIsCenteredOnUser(false);
      return;
    }

    setIsCenteredOnUser(
      isRegionCenteredOnLocation(regionRef.current, location.coords),
    );
  }, [location]);

  // ── Derived: selectedLot ───────────────────────────────────────────────

  const selectedLot = React.useMemo(() => {
    if (!selectedLotId) return null;
    const lot = lots.find((l) => l.id === selectedLotId) ?? null;
    if (lot) lastSelectedLotRef.current = lot;
    return lot;
  }, [lots, selectedLotId]);

  const lotSheetData = selectedLot ?? lastSelectedLotRef.current;

  useEffect(() => {
    const syncSheetVisibility = async () => {
      if (selectedLotId && !isLotSheetVisible) {
        await lotSheetRef.current?.present(0, true);
      } else if (!selectedLotId && isLotSheetVisible) {
        await lotSheetRef.current?.dismiss(true);
      }
    };

    syncSheetVisibility().catch(() => {
      // no-op: sheet can reject present/dismiss during rapid transitions
    });
  }, [selectedLotId, isLotSheetVisible]);

  // ── Derived: displayedLots (filtered for map) ──────────────────────────

  const displayedLots = React.useMemo(() => {
    // noPermitMode === 'all'  → show every lot, no filter
    if (noPermitMode === "all")
      return lots.filter((lot) => enabledCampuses.has(lot.campus));
    // 1. Apply permit-aware filter
    let filtered = lots;
    if (noPermitMode === "commuter_all") {
      filtered = lots.filter((lot) => ALL_COMMUTER_LOT_IDS.has(lot.id));
    } else if (
      (permitType && !permitType.startsWith("__")) ||
      secondaryPermitType
    ) {
      const permitIds = getPermitLotIdsUnion(permitType, secondaryPermitType);
      filtered = lots.filter((lot) => permitIds.has(lot.id));
    }
    // 2. Apply campus filter
    filtered = filtered.filter((lot) => enabledCampuses.has(lot.campus));
    return filtered;
  }, [lots, permitType, secondaryPermitType, noPermitMode, enabledCampuses]);

  // ── Derived: visibleLots (viewport-filtered for lot zoom) ────────────────────
  // Only lots whose centre coordinate falls within the visible map region
  // (plus a 50 % padding buffer) are passed to the renderer.  At typical
  // lot-zoom the viewport covers ~5-15 lots instead of the full 193+.

  const visibleLots = React.useMemo(() => {
    // [Expo Go / New Architecture Workaround]
    // Because Expo Go strictly enforces React Native's New Architecture (Fabric),
    // and react-native-maps (v1.20.1) has a known crash on iOS where dynamically
    // culling/adding Native Component Polygons and Markers causes an
    // `insertObject:atIndex: index beyond bounds` crash due to the view
    // indices de-syncing, we must disable viewport culling.
    // We simply return all displayedLots at the cost of map performance.
    //
    // Re-enable viewport culling only when building a non-Expo-Go Development Build
    // with `newArchEnabled: false`.
    return displayedLots;
  }, [displayedLots]);

  // ── Clusters ───────────────────────────────────────────────────────────

  const clusters = React.useMemo<Cluster[]>(() => {
    if (zoomLevel === "lot") return [];

    if (zoomLevel === "hidden") {
      return [
        {
          id: "university-rutgers",
          type: "region",
          name: "Rutgers University",
          latitude: 40.5008,
          longitude: -74.4474,
          occupancyRate:
            displayedLots.length > 0
              ? displayedLots.reduce((acc, l) => acc + l.occupancyRate, 0) /
                displayedLots.length
              : 0,
          count: displayedLots.length,
        },
      ];
    }

    const campuses: Record<
      string,
      { lat: number; lng: number; count: number; occupancySum: number }
    > = {};
    displayedLots.forEach((lot) => {
      if (!campuses[lot.campus]) {
        campuses[lot.campus] = { lat: 0, lng: 0, count: 0, occupancySum: 0 };
      }
      campuses[lot.campus].lat += lot.latitude;
      campuses[lot.campus].lng += lot.longitude;
      campuses[lot.campus].count += 1;
      campuses[lot.campus].occupancySum += lot.occupancyRate;
    });

    return Object.entries(campuses).map(([name, data]) => ({
      id: `campus-${name}`,
      type: "campus",
      name,
      latitude: data.lat / data.count,
      longitude: data.lng / data.count,
      occupancyRate: data.occupancySum / data.count,
      count: data.count,
    }));
  }, [displayedLots, zoomLevel]);

  const regionRef = useRef<any>(null);
  const lotCooldownRef = useRef(false);

  // ── Favorites ─────────────────────────────────────────────────────────

  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await fetchWithOfflineFallback(
        async () => {
          const resp = await authApiCall("/favorites");
          const ids = (resp?.favorite_lots ?? []).map((l: any) =>
            String(l.lot_id ?? l.id),
          );
          await cacheFavorites(ids, currentUserId);
          return ids;
        },
        "favorites_cache",
        1000 * 60 * 5, // 5-minute staleness threshold
        currentUserId,
      );
      setFavorites(data);
    } catch (e) {
      // Fall back to local cache even if fetchWithOfflineFallback throws
      const cached = await getCachedFavorites(currentUserId);
      if (cached) setFavorites(cached);
      else console.error("[MapScreen] Failed to fetch favorites:", e);
    }
  }, [user, currentUserId]);

  useEffect(() => {
    if (user) fetchFavorites();
  }, [user, fetchFavorites]);

  const toggleFavorite = async (lot: RutgersLot) => {
    if (!user) return;
    const isFavorite = favorites.includes(lot.id);
    const updated = isFavorite
      ? favorites.filter((id) => id !== lot.id)
      : [...favorites, lot.id];
    setFavorites(updated);
    cacheFavorites(updated, currentUserId);
    try {
      if (isFavorite) {
        await authApiCall(`/favorites/${lot.id}`, { method: "DELETE" });
      } else {
        await authApiCall(`/favorites/${lot.id}`, { method: "POST" });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setFavorites((prev) =>
        isFavorite ? [...prev, lot.id] : prev.filter((id) => id !== lot.id),
      );
      cacheFavorites(favorites, currentUserId); // rollback cache too
      Alert.alert("Error", "Failed to update favorites");
    }
  };

  // ── Search Params (from Search tab) ───────────────────────────────────

  const {
    placeLat,
    placeLng,
    placeName,
    selectedLotId: selectedLotIdParam,
  } = params;

  useEffect(() => {
    if (selectedLotIdParam) {
      const lot = lots.find((l) => l.id === selectedLotIdParam);
      if (lot) {
        setSelectedLotId(lot.id);
        mapRef.current?.animateToRegion(
          {
            latitude: lot.latitude,
            longitude: lot.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          },
          1000,
        );
        setSelectedPlace(null);
      }
    } else if (placeLat && placeLng) {
      const lat = Number.parseFloat(placeLat as string);
      const lng = Number.parseFloat(placeLng as string);
      const name = (placeName as string) || "Destination";
      setSelectedPlace((prev) => {
        if (prev?.lat === lat && prev?.lng === lng) return prev;
        mapRef.current?.animateToRegion(
          {
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          },
          1000,
        );
        return { lat, lng, name };
      });
      setSelectedLotId(null);
    }
  }, [selectedLotIdParam, placeLat, placeLng, placeName, lots]);

  // ── Optimistic Occupancy ───────────────────────────────────────────────

  const updateOptimisticOccupancy = useCallback(
    (lotId: string, delta: number) => {
      queryClient.setQueryData(
        ["lots_occupancy"],
        (old: RutgersLot[] | undefined) => {
          if (!old) return old;
          return old.map((lot) => {
            if (lot.id !== lotId) return lot;
            const newOcc = Math.max(0, (lot.occupiedCount ?? 0) + delta);
            return {
              ...lot,
              occupiedCount: newOcc,
              occupancyRate:
                lot.capacity > 0
                  ? Math.min(100, (newOcc / lot.capacity) * 100)
                  : 0,
            };
          });
        },
      );
    },
    [queryClient],
  );

  // ── Pending Parking Detection: load candidates; auto-start if none active ─

  const hasAutoStartedRef = useRef(false);
  useEffect(() => {
    if (!user) {
      queryClient.setQueryData(["session", "active"], { session: null });
      setPendingCandidates([]);
      hasAutoStartedRef.current = false;
      return;
    }
    getPendingParkingCandidates().then(async (candidates) => {
      if (candidates.length === 0) {
        hasAutoStartedRef.current = false;
        return;
      }
      const currentSession =
        queryClient.getQueryData<{ session: ParkingSession | null }>([
          "session",
          "active",
        ])?.session ?? null;
      if (currentSession) {
        await clearPendingParkingCandidates();
        setPendingCandidates([]);
        return;
      }
      if (hasAutoStartedRef.current) return;
      hasAutoStartedRef.current = true;
      const top = candidates[0];
      const payload = {
        lotId: top.lotId,
        latitude: top.latitude,
        longitude: top.longitude,
        confirmed: true,
        autoStarted: true,
      };
      setPendingCandidates([]);
      await clearPendingParkingCandidates();
      try {
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
          await queueParkAction("CONFIRM_DETECTED", payload, undefined, undefined, currentUserId);
          const optimisticSession = {
            id: `offline-${Date.now()}`,
            lotId: top.lotId,
            startTime: new Date().toISOString(),
            latitude: top.latitude,
            longitude: top.longitude,
            autoStarted: true,
          };
          queryClient.setQueryData(["session", "active"], {
            session: optimisticSession,
          });
          await cacheSession({ session: optimisticSession }, currentUserId);
          updateOptimisticOccupancy(top.lotId, 1);
          return;
        }
        const data = await authApiCall("/park/session", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (data?.success && data?.session) {
          queryClient.setQueryData(["session", "active"], {
            session: data.session,
          });
          await cacheSession({ session: data.session }, currentUserId);
          updateOptimisticOccupancy(top.lotId, 1);
        } else {
          setPendingCandidates(candidates);
          hasAutoStartedRef.current = false;
        }
      } catch {
        await queueParkAction("CONFIRM_DETECTED", payload, undefined, undefined, currentUserId);
        const offlineSession = {
          id: `offline-${Date.now()}`,
          lotId: top.lotId,
          startTime: new Date().toISOString(),
          latitude: top.latitude,
          longitude: top.longitude,
          autoStarted: true,
        };
        queryClient.setQueryData(["session", "active"], {
          session: offlineSession,
        });
        await cacheSession({ session: offlineSession }, currentUserId);
        updateOptimisticOccupancy(top.lotId, 1);
      }
    });
  }, [user, queryClient, updateOptimisticOccupancy, currentUserId]);

  // ── Location Permission ────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Location Permission Required",
            "Permission to access location was denied.",
          );
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      } catch (err) {
        console.warn("[MapScreen] Location init failed:", err);
      }
    })();
  }, []);

  // ── Map user location watcher ────────────────────────────────────────────

  const mapUserWatchRef = useRef<{
    position?: { remove: () => void };
  }>({});
  useEffect(() => {
    if (!isFocused) {
      mapUserWatchRef.current.position?.remove();
      mapUserWatchRef.current = {};
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const posSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            distanceInterval: 10,
          },
          (loc) => {
            if (!cancelled) setLocation(loc);
          },
        );
        if (cancelled) {
          posSub.remove();
          return;
        }
        mapUserWatchRef.current.position = posSub;
      } catch (err) {
        if (!cancelled)
          console.warn(
            "[MapScreen] Map user location/heading watch failed:",
            err,
          );
      }
    })();
    return () => {
      cancelled = true;
      mapUserWatchRef.current.position?.remove();
      mapUserWatchRef.current = {};
    };
  }, [isFocused]);

  // ── Find Car chip: live position + heading when session has car coords ───

  const chipWatchRef = useRef<{
    position?: { remove: () => void };
    heading?: { remove: () => void };
  }>({});
  useEffect(() => {
    const hasCarCoords =
      activeSession?.latitude != null && activeSession?.longitude != null;
    if (!hasCarCoords) {
      chipWatchRef.current.position?.remove();
      chipWatchRef.current.heading?.remove();
      chipWatchRef.current = {};
      setChipUserPosition(null);
      setChipHeading(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const posSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 2000,
            distanceInterval: 5,
          },
          (loc) => {
            if (!cancelled)
              setChipUserPosition({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              });
          },
        );
        if (cancelled) {
          posSub.remove();
          return;
        }
        chipWatchRef.current.position = posSub;
        const headSub = await Location.watchHeadingAsync((h) => {
          if (cancelled) return;
          const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (deg >= 0) setChipHeading(deg);
        });
        if (cancelled) {
          headSub.remove();
          posSub.remove();
          return;
        }
        chipWatchRef.current.heading = headSub;
      } catch (err) {
        if (!cancelled)
          console.warn("[MapScreen] Chip location/heading watch failed:", err);
      }
    })();
    return () => {
      cancelled = true;
      chipWatchRef.current.position?.remove();
      chipWatchRef.current.heading?.remove();
      chipWatchRef.current = {};
      setChipUserPosition(null);
      setChipHeading(null);
    };
  }, [activeSession?.latitude, activeSession?.longitude]);

  // ── Park Handler ───────────────────────────────────────────────────────

  const handlePark = async (lotId: string) => {
    if (!user) return;
    const lot = lots.find((l) => l.id === lotId);
    if (!lot) {
      Alert.alert("Error", "Lot not found");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        lotId: lot.id,
        latitude: location?.coords.latitude,
        longitude: location?.coords.longitude,
        confirmed: true,
      };

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await queueParkAction("PARK", payload, undefined, undefined, currentUserId);
        const optimisticSession: ParkingSession = {
          id: `offline-${Date.now()}`,
          lotId: lot.id,
          startTime: new Date().toISOString(),
        };
        queryClient.setQueryData(["session", "active"], {
          session: optimisticSession,
        });
        cacheSession({ session: optimisticSession }, currentUserId).catch(() => {});
        updateOptimisticOccupancy(lot.id, 1);
        setSelectedLotId(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Parked Offline",
          `Session queued. Will sync when back online.`,
        );
        return;
      }

      const data = await authApiCall("/park/session", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (data?.success) {
        const session: ParkingSession = data.session ?? {
          id: `offline-${Date.now()}`,
          lotId: lot.id,
          startTime: new Date().toISOString(),
        };
        queryClient.setQueryData(["session", "active"], { session });
        cacheSession({ session }, currentUserId).catch(() => {});
        if (!data._offline && data.confirmedOccupancy !== undefined) {
          queryClient.setQueryData(
            ["lots_occupancy"],
            (old: RutgersLot[] | undefined) => {
              if (!old) return old;
              return old.map((l) => {
                if (l.id !== lot.id) return l;
                return {
                  ...l,
                  occupiedCount: data.confirmedOccupancy,
                  occupancyRate:
                    l.capacity > 0
                      ? Math.min(
                          100,
                          (data.confirmedOccupancy / l.capacity) * 100,
                        )
                      : 0,
                };
              });
            },
          );
        } else {
          updateOptimisticOccupancy(lot.id, 1);
        }
        setSelectedLotId(null);
        if (data._offline) {
          Alert.alert(
            "Parked Offline",
            `Session at ${lot.shortName} will sync when back online.`,
          );
        }
      }
    } catch (e: any) {
      if (
        e?.message?.toLowerCase().includes("network") ||
        e?.message?.toLowerCase().includes("timeout") ||
        e?.code === "ECONNABORTED"
      ) {
        await queueParkAction("PARK", {
          lotId: lot.id,
          latitude: location?.coords.latitude,
          longitude: location?.coords.longitude,
          confirmed: true,
        }, undefined, undefined, currentUserId);
        updateOptimisticOccupancy(lot.id, 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Alert.alert("Error", e.message || "Failed to start parking session");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── End Session Handler ────────────────────────────────────────────────

  const handleEndSession = async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      const data = await authApiCall("/park/session/end", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (data?.success) {
        const lotIdToRemove = activeSession.lotId;
        queryClient.setQueryData(["session", "active"], { session: null });
        updateOptimisticOccupancy(lotIdToRemove, -1);
        clearCachedSession(currentUserId).catch(() => {});
        setSelectedLotId(null);
        setSelectedPlace(null);
      } else if (!data) {
        queryClient.setQueryData(["session", "active"], { session: null });
        clearCachedSession(currentUserId).catch(() => {});
      }
    } catch {
      Alert.alert("Error", "Failed to end session");
    } finally {
      setLoading(false);
    }
  };

  // ── Find Car Handler ───────────────────────────────────────────────

  const handleFindCar = useCallback(() => {
    if (!activeSession) return;
    const carLat = activeSession.latitude;
    const carLng = activeSession.longitude;
    const lot = lots.find((l) => l.id === activeSession.lotId);

    const targetLat = carLat ?? lot?.latitude;
    const targetLng = carLng ?? lot?.longitude;

    if (targetLat == null || targetLng == null) {
      Alert.alert("Error", "Location coordinates not available");
      return;
    }

    const label =
      carLat != null ? "My Car" : lot?.shortName || "Parked Location";
    const scheme = Platform.select({
      ios: "maps:0,0?q=",
      android: "geo:0,0?q=",
    });
    const latLng = `${targetLat},${targetLng}`;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`,
    });

    if (url) {
      Linking.openURL(url);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [activeSession, lots]);

  // ── Confirm Parking (from detection) ──────────────────────────────────

  const handleConfirmParking = async (candidate: ParkingCandidate) => {
    if (!user) return;
    setIsConfirming(true);
    try {
      const payload = {
        lotId: candidate.lotId,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        confirmed: true,
      };
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await queueParkAction("CONFIRM_DETECTED", payload, undefined, undefined, currentUserId);
        const offlineSession = {
          id: `offline-${Date.now()}`,
          lotId: candidate.lotId,
          startTime: new Date().toISOString(),
        };
        queryClient.setQueryData(["session", "active"], {
          session: offlineSession,
        });
        cacheSession({ session: offlineSession }, currentUserId).catch(() => {});
        updateOptimisticOccupancy(candidate.lotId, 1);
        await clearPendingParkingCandidates();
        setPendingCandidates([]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      const data = await authApiCall("/park/session", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (data?.success && data?.session) {
        queryClient.setQueryData(["session", "active"], {
          session: data.session,
        });
        cacheSession({ session: data.session }, currentUserId).catch(() => {});
        updateOptimisticOccupancy(candidate.lotId, 1);
        await clearPendingParkingCandidates();
        setPendingCandidates([]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      await queueParkAction("CONFIRM_DETECTED", {
        lotId: candidate.lotId,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        confirmed: true,
      }, undefined, undefined, currentUserId);
      await clearPendingParkingCandidates();
      setPendingCandidates([]);
      updateOptimisticOccupancy(candidate.lotId, 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDismissParking = async () => {
    await clearPendingParkingCandidates();
    setPendingCandidates([]);
  };

  // ── Lot Press ─────────────────────────────────────────────────────────

  const handleLotPress = useCallback((lot: RutgersLot) => {
    if (lotCooldownRef.current) return;
    lotCooldownRef.current = true;
    setTimeout(() => {
      lotCooldownRef.current = false;
    }, 650);

    setSelectedLotId(lot.id);
    setSelectedPlace(null);

    if (AppState.currentState === "active") {
      mapRef.current?.animateToRegion(
        {
          latitude: lot.latitude - 0.002,
          longitude: lot.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        500,
      );
    }
  }, []);

  const handleMapPress = useCallback(
    (latitude: number, longitude: number) => {
      if (zoomLevel !== "lot") {
        setSelectedLotId(null);
        setSelectedPlace(null);
        return;
      }

      let closestLot: RutgersLot | null = null;
      let closestMeters = Number.POSITIVE_INFINITY;

      for (const lot of visibleLots) {
        const meters = haversineMeters(
          latitude,
          longitude,
          lot.latitude,
          lot.longitude,
        );
        if (meters < closestMeters) {
          closestMeters = meters;
          closestLot = lot;
        }
      }

      if (closestLot && closestMeters <= LOT_TAP_SNAP_RADIUS_METERS) {
        handleLotPress(closestLot);
        return;
      }

      setSelectedLotId(null);
      setSelectedPlace(null);
    },
    [zoomLevel, visibleLots, handleLotPress],
  );

  // ── Active session lot name (for the floating chip) ───────────────────

  const activeSessionLotName = React.useMemo(() => {
    if (!activeSession) return null;
    const lot = lots.find((l) => l.id === activeSession.lotId);
    return lot?.shortName ?? lot?.name ?? activeSession.lotId;
  }, [activeSession, lots]);

  // ── Find Car chip: distance + arrow rotation when we have car coords ────

  const chipFindCarState = React.useMemo(() => {
    const carLat = activeSession?.latitude;
    const carLng = activeSession?.longitude;
    if (carLat == null || carLng == null) return null;
    const userPos =
      chipUserPosition ??
      (location
        ? {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          }
        : null);
    if (!userPos) return { distanceText: "—", arrowRotation: 0 };
    const meters = haversineMeters(
      userPos.latitude,
      userPos.longitude,
      carLat,
      carLng,
    );
    const feet = meters * 3.28084;
    const distanceText =
      feet < 500 ? `${Math.round(feet)} ft` : `${Math.round(meters)} m`;
    const bear = bearingDeg(
      userPos.latitude,
      userPos.longitude,
      carLat,
      carLng,
    );
    const heading = chipHeading ?? 0;
    const arrowRotation = (bear - heading + 360) % 360;
    return { distanceText, arrowRotation };
  }, [
    activeSession?.latitude,
    activeSession?.longitude,
    chipUserPosition,
    location,
    chipHeading,
  ]);

  // ── Map Styles ────────────────────────────────────────────────────────

  const darkMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#101012" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#71717a" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#09090b" }] },
    {
      featureType: "administrative.country",
      elementType: "geometry.stroke",
      stylers: [{ color: "#374151" }],
    },
    {
      featureType: "landscape.man_made",
      elementType: "geometry.stroke",
      stylers: [{ color: "#172554" }],
    },
    {
      featureType: "landscape.natural",
      elementType: "geometry",
      stylers: [{ color: "#09090b" }],
    },
    {
      featureType: "poi",
      elementType: "geometry",
      stylers: [{ color: "#0f172a" }],
    },
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [{ color: "#64748b" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry.fill",
      stylers: [{ color: "#020617" }],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.fill",
      stylers: [{ color: "#0f766e" }],
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#0f172a" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#475569" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#0e7490" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry.stroke",
      stylers: [{ color: "#155e75" }],
    },
    {
      featureType: "road.highway",
      elementType: "labels.text.fill",
      stylers: [{ color: "#22d3ee" }],
    },
    {
      featureType: "transit",
      elementType: "labels.text.fill",
      stylers: [{ color: "#475569" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#000000" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [{ color: "#1e293b" }],
    },
  ];

  const lightMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
    {
      featureType: "administrative.land_parcel",
      elementType: "labels.text.fill",
      stylers: [{ color: "#bdbdbd" }],
    },
    {
      featureType: "landscape.natural",
      elementType: "geometry",
      stylers: [{ color: "#e8f0e8" }],
    },
    {
      featureType: "poi",
      elementType: "geometry",
      stylers: [{ color: "#eeeeee" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#d5e8d4" }],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.fill",
      stylers: [{ color: "#9e9e9e" }],
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#ffffff" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#9e9e9e" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#dadada" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry.stroke",
      stylers: [{ color: "#b0b0b0" }],
    },
    {
      featureType: "road.highway",
      elementType: "labels.text.fill",
      stylers: [{ color: "#616161" }],
    },
    {
      featureType: "transit",
      elementType: "geometry",
      stylers: [{ color: "#f2f2f2" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#c9d9e8" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [{ color: "#9e9e9e" }],
    },
  ];

  const activeMapStyle = isDark ? darkMapStyle : lightMapStyle;

  const mapProvider =
    Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={mapProvider}
        style={styles.map}
        customMapStyle={activeMapStyle}
        userInterfaceStyle={isDark ? "dark" : "light"}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsTraffic={false}
        initialRegion={{
          latitude: 40.5008,
          longitude: -74.4474,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        onRegionChangeComplete={(region) => {
          regionRef.current = region;
          setIsCenteredOnUser(
            location
              ? isRegionCenteredOnLocation(region, location.coords)
              : false,
          );
          let newZoom: ZoomLevel = "hidden";
          if (region.latitudeDelta < 0.05) newZoom = "lot";
          else if (region.latitudeDelta < 0.6) newZoom = "campus";
          setZoomLevel((prev) => (prev === newZoom ? prev : newZoom));
        }}
        onPress={(e) =>
          handleMapPress(
            e.nativeEvent.coordinate.latitude,
            e.nativeEvent.coordinate.longitude,
          )
        }
      >
        {/* Lot polygons at zoom level 'lot' */}
        {zoomLevel === "lot" &&
          visibleLots.flatMap((lot) => {
            const isSelected = selectedLot?.id === lot.id;
            const available =
              isLotAvailableNow(permitType, lot.id) ||
              isSecondaryPermitAvailableNow(secondaryPermitType, lot.id);
            const isDimmed = available === false;
            const colors = isDimmed
              ? { full: "#52525b", bg: "rgba(82, 82, 91, 0.25)" }
              : getOccupancyColor(lot.occupancyRate);

            const validPolys = lot.coordinates
              .map((polyCoords, index) => {
                const polygonCoords = polyCoords
                  .map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
                  .filter(
                    (c) =>
                      !Number.isNaN(c.latitude) && !Number.isNaN(c.longitude),
                  );

                const holeCoords = (lot.holes[index] || [])
                  .map((ring) =>
                    ring
                      .map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
                      .filter(
                        (c) =>
                          !Number.isNaN(c.latitude) &&
                          !Number.isNaN(c.longitude),
                      ),
                  )
                  .filter((ring) => ring.length >= 3);

                return { polygonCoords, holeCoords, index };
              })
              .filter((p) => p.polygonCoords.length >= 3);

            return validPolys.map(({ polygonCoords, holeCoords, index }) => (
              <Polygon
                key={`${lot.id}-poly-${index}`}
                coordinates={polygonCoords}
                holes={holeCoords.length > 0 ? holeCoords : undefined}
                fillColor={isSelected ? colors.bg : colors.bg}
                strokeColor={isSelected ? "#ffffff" : colors.full}
                strokeWidth={isSelected ? 3 : 2}
                tappable={true}
                zIndex={isSelected ? 10 : 1}
                onPress={(e) => {
                  e.stopPropagation();
                  handleLotPress(lot);
                }}
              />
            ));
          })}

        {/* Lot markers at zoom level 'lot' */}
        {zoomLevel === "lot" &&
          visibleLots.map((lot) => {
            const isSelected = selectedLot?.id === lot.id;
            const isFavorite = favorites.includes(lot.id);
            const available =
              isLotAvailableNow(permitType, lot.id) ||
              isSecondaryPermitAvailableNow(secondaryPermitType, lot.id);
            const isDimmed = available === false;
            const colors = isDimmed
              ? { full: "#52525b", bg: "rgba(82, 82, 91, 0.25)" }
              : getOccupancyColor(lot.occupancyRate);

            return (
              <Marker
                key={`lot-${lot.id}`}
                coordinate={{
                  latitude: lot.latitude,
                  longitude: lot.longitude,
                }}
                onPress={(e) => {
                  e.stopPropagation();
                  handleLotPress(lot);
                }}
                zIndex={isSelected ? 11 : 2}
                tracksViewChanges={false}
              >
                <View style={styles.markerHitTarget}>
                  <View
                    style={[
                      styles.markerContainer,
                      isSelected && { transform: [{ scale: 1.2 }] },
                    ]}
                  >
                    <View
                      style={[
                        styles.markerBubble,
                        { backgroundColor: colors.full },
                        isSelected && { borderColor: "#fff", borderWidth: 2 },
                      ]}
                    >
                      <Text style={styles.markerText}>
                        {isDimmed ? "—" : `${Math.round(lot.occupancyRate)}%`}
                      </Text>
                      {isFavorite && (
                        <View style={[styles.favoriteBadge, { backgroundColor: isDark ? "#18181b" : "#ffffff" }]}>
                          <IconSymbol
                            name="star.fill"
                            size={10}
                            color="#f59e0b"
                          />
                        </View>
                      )}
                    </View>
                    <View
                      style={[
                        styles.markerArrow,
                        { borderTopColor: colors.full },
                        isSelected && { borderTopColor: "#fff" },
                      ]}
                    />
                  </View>
                </View>
              </Marker>
            );
          })}

        {/* Campus / region clusters */}
        {zoomLevel !== "lot" &&
          clusters.map((cluster) => (
            <Marker
              key={`cluster-${cluster.id}`}
              coordinate={{
                latitude: cluster.latitude,
                longitude: cluster.longitude,
              }}
              tracksViewChanges={false}
              onPress={() => {
                if (lotCooldownRef.current) return;
                lotCooldownRef.current = true;
                setTimeout(() => {
                  lotCooldownRef.current = false;
                }, 650);
                mapRef.current?.animateToRegion(
                  {
                    latitude: cluster.latitude,
                    longitude: cluster.longitude,
                    latitudeDelta: cluster.type === "region" ? 0.05 : 0.01,
                    longitudeDelta: cluster.type === "region" ? 0.05 : 0.01,
                  },
                  500,
                );
              }}
              zIndex={20}
            >
              <View style={styles.campusMarker}>
                <View
                  style={[
                    styles.clusterBadge,
                    { backgroundColor: getClusterColor(cluster.occupancyRate) },
                  ]}
                >
                  <Text style={styles.clusterText}>
                    {cluster.name}: {Math.round(cluster.occupancyRate)}%
                  </Text>
                </View>
              </View>
            </Marker>
          ))}

        {/* Search destination pin */}
        {selectedPlace && (
          <Marker
            coordinate={{
              latitude: selectedPlace.lat,
              longitude: selectedPlace.lng,
            }}
            title={selectedPlace.name}
            pinColor="#3b82f6"
          />
        )}

        {/* Detection candidate pins */}
        {pendingCandidates.map((candidate) => (
          <CandidatePin
            key={candidate.lotId}
            candidate={candidate}
            horizontalAccuracy={location?.coords.accuracy}
            onPress={() => {}}
          />
        ))}
      </MapView>

      {/* Center-on-me button */}
      <Animated.View style={[styles.centerButtonContainer, centerButtonStyle, !isDark && { borderColor: "rgba(0,0,0,0.1)", shadowOpacity: 0.2 }]}>
        <GlassBackground
          style={StyleSheet.absoluteFill}
          glassStyle="regular"
          blurIntensity={80}
          tintColor={isDark ? "rgba(0, 0, 0, 0.4)" : undefined}
          tintOpacity={0.8}
        />
          <TouchableOpacity
          style={[
            styles.centerButton,
            styles.centerButtonActive,
            isCenterButtonPressed && styles.centerButtonPressed,
            Platform.OS === "android" && styles.centerButtonAndroid,
            !isDark && { backgroundColor: "rgba(0,0,0,0.05)" },
            !isDark && isCenterButtonPressed && { backgroundColor: "rgba(0,0,0,0.10)" },
          ]}
          onPressIn={() => {
            setIsCenterButtonPressed(true);
            centerButtonScale.value = withSpring(0.9, {
              damping: 10,
              stiffness: 200,
            });
          }}
          onPressOut={() => {
            setIsCenterButtonPressed(false);
            centerButtonScale.value = withSpring(1, {
              damping: 15,
              stiffness: 200,
            });
          }}
          onPress={() => {
            if (!location || lotCooldownRef.current) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            lotCooldownRef.current = true;
            setTimeout(() => {
              lotCooldownRef.current = false;
            }, 650);
            mapRef.current?.animateToRegion(
              {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.005,
              },
              500,
            );
          }}
          accessibilityState={{ selected: isCenteredOnUser }}
          activeOpacity={1}
        >
          <IconSymbol
            name="location.north.fill"
            size={20}
            color={isDark ? "#ffffff" : "#3f3f46"}
          />
        </TouchableOpacity>
      </Animated.View>

      <TrueSheet
        ref={lotSheetRef}
        detents={["auto", 0.5, 0.84]}
        onDidPresent={() => setIsLotSheetVisible(true)}
        onDidDismiss={() => {
          setIsLotSheetVisible(false);
          setSelectedLotId(null);
        }}
      >
        {lotSheetData ? (
          <LotDetailsSheetContent
            key={isLotSheetVisible ? `open-${lotSheetData.id}` : "closed"}
            lot={lotSheetData}
            isFavorite={favorites.includes(lotSheetData.id)}
            onToggleFavorite={() => void toggleFavorite(lotSheetData)}
            onPark={(id) => void handlePark(id)}
            loading={loading}
            user={user}
            activeSession={activeSession}
            permitType={permitType}
            secondaryPermitType={secondaryPermitType}
          />
        ) : null}
      </TrueSheet>

      {/* ── Active Session Floating Chip ── */}
      {activeSession && (
        <View style={styles.sessionChipContainer}>
          <GlassBackground
            style={StyleSheet.absoluteFill}
            glassStyle="regular"
            blurIntensity={90}
          />
          <View style={[styles.sessionChipContent, !isDark && { backgroundColor: "rgba(245,245,247,0.6)" }]}>
            <View style={styles.sessionChipDot} />
            <View style={styles.sessionChipTitleRow}>
              <Text
                style={[
                  styles.sessionChipText,
                  !isDark && { color: "#111111" },
                ]}
                numberOfLines={1}
              >
                {activeSessionLotName ?? "Parked"}
              </Text>
              {activeSession?.autoStarted && (
                <Text
                  style={[
                    styles.sessionChipSubtitle,
                    !isDark && { color: "rgba(0,0,0,0.5)" },
                  ]}
                  numberOfLines={1}
                >
                  We detected you parked here. Wrong? Tap End to remove.
                </Text>
              )}
            </View>
            <View
              style={[
                styles.sessionChipDivider,
                !isDark && { backgroundColor: "rgba(0,0,0,0.12)" },
              ]}
            />
            {chipFindCarState != null ? (
              <TouchableOpacity
                style={styles.sessionChipFindCar}
                onPress={handleFindCar}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.sessionChipArrowWrap,
                    {
                      transform: [
                        { rotate: `${chipFindCarState.arrowRotation}deg` },
                      ],
                    },
                  ]}
                >
                  <IconSymbol
                    name="location.north.fill"
                    size={14}
                    color="#60a5fa"
                  />
                </View>
                <Text style={styles.sessionChipDistance}>
                  {chipFindCarState.distanceText}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleFindCar}
                style={styles.sessionChipAction}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <IconSymbol
                  name="arrow.triangle.turn.up.right.diamond.fill"
                  size={15}
                  color="#60a5fa"
                />
                <Text style={styles.sessionChipActionText}>Directions</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  "End Session",
                  `End parking at ${activeSessionLotName}?`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "End",
                      style: "destructive",
                      onPress: handleEndSession,
                    },
                  ],
                );
              }}
              style={[styles.sessionChipAction, styles.sessionChipEnd]}
              disabled={loading}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <Text style={styles.sessionChipEndText}>End</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Detection Confirmation Sheet */}
      {pendingCandidates.length > 0 && (
        <ParkingConfirmationSheet
          candidates={pendingCandidates}
          onConfirm={handleConfirmParking}
          onDismiss={handleDismissParking}
          isLoading={isConfirming}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: "100%", height: "100%" },

  // ── Session chip ──────────────────────────────────────────────────────
  sessionChipContainer: {
    position: "absolute",
    bottom: 105,
    alignSelf: "center",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.4)",
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: 320,
  },
  sessionChipContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 16,
    gap: 10,
    backgroundColor:
      Platform.OS === "android"
        ? "rgba(14,14,16,0.97)"
        : "rgba(20, 20, 22, 0.4)",
  },
  sessionChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  sessionChipTitleRow: {
    flexDirection: "column",
    flexShrink: 1,
    maxWidth: 130,
    gap: 2,
  },
  sessionChipText: {
    color: "#f4f4f5",
    fontSize: 14,
    fontWeight: "600",
  },
  sessionChipSubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "400",
  },
  sessionChipFindCar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sessionChipArrowWrap: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionChipDistance: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: "600",
    minWidth: 44,
  },
  sessionChipDivider: {
    width: 1,
    height: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  sessionChipAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  sessionChipActionText: {
    color: "#60a5fa",
    fontSize: 13,
    fontWeight: "600",
  },
  sessionChipEnd: { paddingHorizontal: 2 },
  sessionChipEndText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "700",
  },

  // ── Center button ──────────────────────────────────────────────────────
  centerButtonContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 110 : 100,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    elevation: 18,
  },
  centerButton: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 24,
    backgroundColor: "transparent",
  },
  centerButtonActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  centerButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  centerButtonAndroid: { backgroundColor: "rgba(255,255,255,0.08)" },

  // ── Permit banner ─────────────────────────────────────────────────────
  permitBanner: {
    position: "absolute",
    bottom: 110,
    alignSelf: "center",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    backgroundColor:
      Platform.OS === "android" ? "rgba(14,14,16,0.97)" : "transparent",
  },
  permitBannerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor:
      Platform.OS === "android" ? "transparent" : "rgba(18,18,20,0.35)",
  },
  permitBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(220,38,38,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  permitBannerText: { color: "#a1a1aa", fontSize: 13, fontWeight: "500" },

  // ── Lot markers ───────────────────────────────────────────────────────
  markerHitTarget: {
    minWidth: 62,
    minHeight: 62,
    alignItems: "center",
    justifyContent: "center",
  },
  markerContainer: { alignItems: "center" },
  markerBubble: {
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 40,
    alignItems: "center",
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  markerText: { color: "white", fontSize: 12, fontWeight: "bold" },
  markerArrow: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#dc2626",
    transform: [{ translateY: -1 }],
  },
  favoriteBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#18181b",
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f59e0b",
  },

  // ── Campus clusters ────────────────────────────────────────────────────
  campusMarker: { alignItems: "center" },
  clusterBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  clusterText: { color: "#fff", fontSize: 13, fontWeight: "bold" },
});
