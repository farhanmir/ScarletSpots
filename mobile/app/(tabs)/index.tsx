import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Platform, Alert, Text, TouchableOpacity, ActivityIndicator, AppState } from 'react-native';
import { BlurView } from 'expo-blur';
import MapView, { PROVIDER_GOOGLE, PROVIDER_DEFAULT, Polygon, Marker } from 'react-native-maps';
import GlassCard from '../../components/ui/GlassCard';
import { Theme } from '@/constants/theme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApiCall, supabase } from '../../lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import LotDetails from '../../components/LotDetails';
import ParkingConfirmationSheet from '../../components/ParkingConfirmationSheet';
import CandidatePin from '../../components/Map/CandidatePin';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getPendingParkingCandidates, clearPendingParkingCandidates } from '../../services/BackgroundTasks';
import { type ParkingCandidate } from '../../services/ParkingDetectionService';
import { registerLotGeofences } from '../../services/GeofenceManager';
import { fetchWithOfflineFallback, clearCachedSession, cacheFavorites, getCachedFavorites } from '../../services/OfflineCache';
import {
  initOfflineQueue,
  queueParkAction,
  addQueueListener,
  getPendingCount,
} from '../../services/OfflineQueue';
import { getAllLots, applyOccupancy, getPermitLotIds, ALL_COMMUTER_LOT_IDS, type RutgersLot } from '../../data/lots';
import { ENABLE_ALL_CAMPUSES } from '../../constants/featureFlags';

// ── Types ──────────────────────────────────────────────────────────────────

interface ParkingSession {
  id: string;
  lotId: string;
  startTime: string;
  endTime?: string;
}

type ZoomLevel = 'lot' | 'campus' | 'hidden';

interface Cluster {
  id: string;
  type: 'campus' | 'region';
  name: string;
  latitude: number;
  longitude: number;
  occupancyRate: number;
  count: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const getOccupancyColor = (rate: number) => {
  if (rate >= 90) return { full: '#b91c1c', bg: 'rgba(185, 28, 28, 0.45)', glow: '#b91c1c' };
  if (rate >= 70) return { full: '#b45309', bg: 'rgba(180, 83, 9, 0.45)', glow: '#b45309' };
  return { full: '#047857', bg: 'rgba(4, 120, 87, 0.40)', glow: '#059669' };
};

const getClusterColor = (rate: number) => {
  if (rate > 80) return '#ef4444';
  if (rate > 50) return '#f59e0b';
  return '#059669';
};

// ── Static lot base (from bundled JSON, no API call) ──────────────────────
// Computed once at module load — never re-fetched unless the app updates.
const STATIC_LOTS = getAllLots(ENABLE_ALL_CAMPUSES);

// ── Component ──────────────────────────────────────────────────────────────

export default function MapScreen() {
  const router = useRouter();
  const { user, permitType, noPermitMode, customLotFilter } = useAuth();
  const queryClient = useQueryClient();
  const mapRef = useRef<MapView>(null);
  const params = useLocalSearchParams();

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('campus');
  const [pendingCandidates, setPendingCandidates] = useState<ParkingCandidate[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [lotTypeFilter, setLotTypeFilter] = useState<'student' | 'employee' | 'gated' | 'ev' | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  // Tracks the last completed map region — drives viewport-culled rendering.
  const [visibleRegion, setVisibleRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);

  const isFocused = useIsFocused();

  // ── Offline Queue Init ─────────────────────────────────────────────────

  useEffect(() => {
    initOfflineQueue();
    const unsubscribeQueue = addQueueListener(count => setPendingSyncCount(count));
    getPendingCount().then(setPendingSyncCount);
    NetInfo.fetch().then(state => setIsOnline(!!state.isConnected));
    const unsubscribeNet = NetInfo.addEventListener(state => setIsOnline(!!state.isConnected));
    return () => {
      unsubscribeQueue();
      unsubscribeNet();
    };
  }, []);

  // ── Occupancy Data (from Supabase lot_occupancy table) ────────────────
  //
  // Lot metadata (names, polygons, capacity) comes from the bundled JSON.
  // Only the live occupancy count is fetched from the backend — one small
  // query that returns a flat list of {lot_id, count} rows.
  //
  const { data: lots = STATIC_LOTS } = useQuery<RutgersLot[]>({
    queryKey: ['lots_occupancy'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('lot_occupancy')
          .select('lot_id, count');
        if (error) throw error;

        const occupancyMap: Record<string, number> = {};
        for (const row of (data ?? [])) {
          occupancyMap[row.lot_id] = row.count ?? 0;
        }
        return applyOccupancy(getAllLots(ENABLE_ALL_CAMPUSES), occupancyMap);
      } catch {
        // If the query fails, return static data with 0 occupancy
        return STATIC_LOTS.map(l => ({ ...l }));
      }
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: isFocused ? 1000 * 60 * 5 : false,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    initialData: STATIC_LOTS.map(l => ({ ...l })),
  });

  // ── Realtime Occupancy Updates ────────────────────────────────────────

  useEffect(() => {
    if (!isFocused) return;

    const channel = supabase
      .channel('lot-occupancy-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lot_occupancy' },
        (payload) => {
          const row = payload.new as { lot_id: string; count: number } | null;
          if (!row?.lot_id) return;

          queryClient.setQueryData(['lots_occupancy'], (old: RutgersLot[] | undefined) => {
            if (!old) return old;
            return old.map(lot => {
              if (lot.id !== row.lot_id) return lot;
              const newCount = row.count ?? 0;
              return {
                ...lot,
                occupiedCount: newCount,
                occupancyRate: lot.capacity > 0
                  ? Math.min(100, (newCount / lot.capacity) * 100)
                  : 0,
              };
            });
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [isFocused, queryClient]);

  // ── Geofence Registration ──────────────────────────────────────────────
  // Register once on first load — geofences are based on static coordinates.

  const geofencesRegistered = useRef(false);
  useEffect(() => {
    if (geofencesRegistered.current) return;
    geofencesRegistered.current = true;
    registerLotGeofences(STATIC_LOTS).catch(err =>
      console.warn('[MapScreen] Geofence registration failed:', err)
    );
  }, []);

  // ── Active Session ─────────────────────────────────────────────────────

  const { data: sessionData } = useQuery<{ session: ParkingSession | null }>({
    queryKey: ['session', 'active'],
    queryFn: async () => {
      const result = await fetchWithOfflineFallback(
        async () => {
          const data = await authApiCall('/park/session/active');
          return data;
        },
        'offline_cache_session',
        1000 * 60 * 1
      );
      return result.data ?? { session: null };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2.5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const activeSession = sessionData?.session ?? null;

  // ── Derived: selectedLot ───────────────────────────────────────────────

  const selectedLot = React.useMemo(() => {
    if (!selectedLotId) return null;
    return lots.find(l => l.id === selectedLotId) ?? null;
  }, [lots, selectedLotId]);

  // ── Derived: displayedLots (filtered for map) ──────────────────────────

  const displayedLots = React.useMemo(() => {
    // 1. Apply permit-aware filter first
    let filtered = lots;
    if (noPermitMode === 'commuter_all') {
      filtered = lots.filter(lot => ALL_COMMUTER_LOT_IDS.has(lot.id));
    } else if (noPermitMode === 'custom' && customLotFilter.size > 0) {
      filtered = lots.filter(lot =>
        Array.from(customLotFilter).some(flag => {
          if (flag === 'student')  return lot.student;
          if (flag === 'employee') return lot.employee;
          if (flag === 'gated')    return lot.regularGate || lot.smartGate;
          if (flag === 'ev')       return lot.evCharging > 0;
          return false;
        })
      );
    } else if (permitType && !permitType.startsWith('__')) {
      const permitIds = getPermitLotIds(permitType);
      filtered = lots.filter(lot => permitIds.has(lot.id));
    }
    // 2. Apply the additional manual type filter on top
    if (!lotTypeFilter) return filtered;
    return filtered.filter(lot => {
      switch (lotTypeFilter) {
        case 'student':  return lot.student;
        case 'employee': return lot.employee;
        case 'gated':    return lot.regularGate || lot.smartGate;
        case 'ev':       return lot.evCharging > 0;
        default:         return true;
      }
    });
  }, [lots, lotTypeFilter, permitType, noPermitMode, customLotFilter]);

  // ── Derived: visibleLots (viewport-filtered for lot zoom) ────────────────────
  // Only lots whose centre coordinate falls within the visible map region
  // (plus a 50 % padding buffer) are passed to the renderer.  At typical
  // lot-zoom the viewport covers ~5-15 lots instead of the full 193+.

  const visibleLots = React.useMemo(() => {
    if (zoomLevel !== 'lot' || !visibleRegion) return displayedLots;
    const pad = 0.5;
    const halfLat = visibleRegion.latitudeDelta * (0.5 + pad);
    const halfLng = visibleRegion.longitudeDelta * (0.5 + pad);
    const minLat = visibleRegion.latitude - halfLat;
    const maxLat = visibleRegion.latitude + halfLat;
    const minLng = visibleRegion.longitude - halfLng;
    const maxLng = visibleRegion.longitude + halfLng;
    return displayedLots.filter(
      lot =>
        lot.latitude  >= minLat && lot.latitude  <= maxLat &&
        lot.longitude >= minLng && lot.longitude <= maxLng,
    );
  }, [displayedLots, visibleRegion, zoomLevel]);

  // ── Clusters ───────────────────────────────────────────────────────────

  const clusters = React.useMemo<Cluster[]>(() => {
    if (zoomLevel === 'lot') return [];

    if (zoomLevel === 'hidden') {
      return [{
        id: 'university-rutgers',
        type: 'region',
        name: 'Rutgers University',
        latitude: 40.5008,
        longitude: -74.4474,
        occupancyRate: lots.length > 0
          ? lots.reduce((acc, l) => acc + l.occupancyRate, 0) / lots.length
          : 0,
        count: lots.length,
      }];
    }

    const campuses: Record<string, { lat: number; lng: number; count: number; occupancySum: number }> = {};
    lots.forEach(lot => {
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
      type: 'campus',
      name,
      latitude: data.lat / data.count,
      longitude: data.lng / data.count,
      occupancyRate: data.occupancySum / data.count,
      count: data.count,
    }));
  }, [lots, zoomLevel]);

  const regionRef = useRef<any>(null);
  const savedRegionRef = useRef<any>(null);
  const lotCooldownRef = useRef(false);

  // ── Favorites ─────────────────────────────────────────────────────────

  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await fetchWithOfflineFallback(
        async () => {
          const resp = await authApiCall('/favorites');
          const ids = (resp?.favorite_lots ?? []).map((l: any) => String(l.lot_id ?? l.id));
          await cacheFavorites(ids);
          return ids;
        },
        'favorites_cache',
        1000 * 60 * 5, // 5-minute staleness threshold
      );
      setFavorites(data);
    } catch (e) {
      // Fall back to local cache even if fetchWithOfflineFallback throws
      const cached = await getCachedFavorites();
      if (cached) setFavorites(cached);
      else console.error('[MapScreen] Failed to fetch favorites:', e);
    }
  }, [user]);

  useEffect(() => { if (user) fetchFavorites(); }, [user, fetchFavorites]);

  const toggleFavorite = async (lot: RutgersLot) => {
    if (!user) return;
    const isFavorite = favorites.includes(lot.id);
    const updated = isFavorite ? favorites.filter(id => id !== lot.id) : [...favorites, lot.id];
    setFavorites(updated);
    cacheFavorites(updated);
    try {
      if (isFavorite) {
        await authApiCall(`/favorites/${lot.id}`, { method: 'DELETE' });
      } else {
        await authApiCall(`/favorites/${lot.id}`, { method: 'POST' });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setFavorites(prev => isFavorite ? [...prev, lot.id] : prev.filter(id => id !== lot.id));
      cacheFavorites(favorites); // rollback cache too
      Alert.alert('Error', 'Failed to update favorites');
    }
  };

  // ── Search Params (from Search tab) ───────────────────────────────────

  const { placeLat, placeLng, placeName, selectedLotId: selectedLotIdParam } = params;

  useEffect(() => {
    if (selectedLotIdParam) {
      const lot = lots.find(l => l.id === selectedLotIdParam);
      if (lot) {
        setSelectedLotId(lot.id);
        mapRef.current?.animateToRegion({
          latitude: lot.latitude,
          longitude: lot.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 1000);
        setSelectedPlace(null);
      }
    } else if (placeLat && placeLng) {
      const lat = Number.parseFloat(placeLat as string);
      const lng = Number.parseFloat(placeLng as string);
      const name = (placeName as string) || 'Destination';
      setSelectedPlace(prev => {
        if (prev?.lat === lat && prev?.lng === lng) return prev;
        mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 1000);
        return { lat, lng, name };
      });
      setSelectedLotId(null);
    }
  }, [selectedLotIdParam, placeLat, placeLng, placeName, lots]);

  // ── Pending Parking Detection ──────────────────────────────────────────

  useEffect(() => {
    if (user) {
      getPendingParkingCandidates().then(candidates => {
        if (candidates.length > 0) setPendingCandidates(candidates);
      });
    } else {
      queryClient.setQueryData(['session', 'active'], { session: null });
      setPendingCandidates([]);
    }
  }, [user, queryClient]);

  // ── Location Permission ────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Location Permission Required', 'Permission to access location was denied.');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      } catch (err) {
        console.warn('[MapScreen] Location init failed:', err);
      }
    })();
  }, []);

  // ── Close Lot Sheet ────────────────────────────────────────────────────

  const clearRouteSelectionParams = useCallback(() => {
    router.setParams({ selectedLotId: undefined, placeLat: undefined, placeLng: undefined, placeName: undefined });
  }, [router]);

  const closeLotDetails = useCallback(() => {
    if (lotCooldownRef.current || !selectedLotId) return;
    lotCooldownRef.current = true;
    setTimeout(() => { lotCooldownRef.current = false; }, 650);
    setSelectedLotId(null);
    if (savedRegionRef.current && AppState.currentState === 'active') {
      mapRef.current?.animateToRegion(savedRegionRef.current, 500);
      savedRegionRef.current = null;
    }
    clearRouteSelectionParams();
  }, [selectedLotId, clearRouteSelectionParams]);

  // ── Optimistic Occupancy ───────────────────────────────────────────────

  const updateOptimisticOccupancy = useCallback((lotId: string, delta: number) => {
    queryClient.setQueryData(['lots_occupancy'], (old: RutgersLot[] | undefined) => {
      if (!old) return old;
      return old.map(lot => {
        if (lot.id !== lotId) return lot;
        const newOcc = Math.max(0, (lot.occupiedCount ?? 0) + delta);
        return {
          ...lot,
          occupiedCount: newOcc,
          occupancyRate: lot.capacity > 0 ? Math.min(100, (newOcc / lot.capacity) * 100) : 0,
        };
      });
    });
  }, [queryClient]);

  // ── Park Handler ───────────────────────────────────────────────────────

  const handlePark = async (lotId: string) => {
    if (!user) return;
    const lot = lots.find(l => l.id === lotId);
    if (!lot) { Alert.alert('Error', 'Lot not found'); return; }

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
        await queueParkAction('PARK', payload);
        const optimisticSession: ParkingSession = {
          id: `offline-${Date.now()}`, lotId: lot.id,
          startTime: new Date().toISOString(),
        };
        queryClient.setQueryData(['session', 'active'], { session: optimisticSession });
        updateOptimisticOccupancy(lot.id, 1);
        setSelectedLotId(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Parked Offline', `Session queued. Will sync when back online.`);
        return;
      }

      const data = await authApiCall('/park/session', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (data?.success) {
        const session: ParkingSession = data.session ?? {
          id: `offline-${Date.now()}`, lotId: lot.id,
          startTime: new Date().toISOString(),
        };
        queryClient.setQueryData(['session', 'active'], { session });
        if (!data._offline && data.confirmedOccupancy !== undefined) {
          queryClient.setQueryData(['lots_occupancy'], (old: RutgersLot[] | undefined) => {
            if (!old) return old;
            return old.map(l => {
              if (l.id !== lot.id) return l;
              return {
                ...l,
                occupiedCount: data.confirmedOccupancy,
                occupancyRate: l.capacity > 0
                  ? Math.min(100, (data.confirmedOccupancy / l.capacity) * 100) : 0,
              };
            });
          });
        } else {
          updateOptimisticOccupancy(lot.id, 1);
        }
        setSelectedLotId(null);
        if (data._offline) {
          Alert.alert('Parked Offline', `Session at ${lot.shortName} will sync when back online.`);
        }
      }
    } catch (e: any) {
      if (
        e?.message?.toLowerCase().includes('network') ||
        e?.message?.toLowerCase().includes('timeout') ||
        e?.code === 'ECONNABORTED'
      ) {
          await queueParkAction('PARK', {
          lotId: lot.id,
          latitude: location?.coords.latitude,
          longitude: location?.coords.longitude,
          confirmed: true,
        });
        updateOptimisticOccupancy(lot.id, 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Alert.alert('Error', e.message || 'Failed to start parking session');
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
      const data = await authApiCall('/park/session/end', { method: 'POST', body: JSON.stringify({}) });
      if (data?.success) {
        const lotIdToRemove = activeSession.lotId;
        queryClient.setQueryData(['session', 'active'], { session: null });
        updateOptimisticOccupancy(lotIdToRemove, -1);
        clearCachedSession().catch(() => {});
        setSelectedLotId(null);
        setSelectedPlace(null);
        clearRouteSelectionParams();
      } else if (!data) {
        queryClient.setQueryData(['session', 'active'], { session: null });
        clearCachedSession().catch(() => {});
      }
    } catch {
      Alert.alert('Error', 'Failed to end session');
    } finally {
      setLoading(false);
    }
  };

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
        await queueParkAction('CONFIRM_DETECTED', payload);
        queryClient.setQueryData(['session', 'active'], {
          session: { id: `offline-${Date.now()}`, lotId: candidate.lotId, startTime: new Date().toISOString() },
        });
        updateOptimisticOccupancy(candidate.lotId, 1);
        await clearPendingParkingCandidates();
        setPendingCandidates([]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      const data = await authApiCall('/park/session', { method: 'POST', body: JSON.stringify(payload) });
      if (data?.success) {
        queryClient.setQueryData(['session', 'active'], { session: data.session });
        updateOptimisticOccupancy(candidate.lotId, 1);
        await clearPendingParkingCandidates();
        setPendingCandidates([]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      await queueParkAction('CONFIRM_DETECTED', {
        lotId: candidate.lotId,
        latitude: candidate.latitude, longitude: candidate.longitude, confirmed: true,
      });
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
    if (lotCooldownRef.current || selectedLotId === lot.id) return;
    lotCooldownRef.current = true;
    setTimeout(() => { lotCooldownRef.current = false; }, 650);
    if (!selectedLotId && regionRef.current && !savedRegionRef.current) {
      savedRegionRef.current = regionRef.current;
    }
    setSelectedLotId(lot.id);
    if (AppState.currentState === 'active') {
      mapRef.current?.animateToRegion({
        latitude: lot.latitude - 0.002,
        longitude: lot.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 500);
    }
  }, [selectedLotId]);

  // ── Active session lot name (for the floating chip) ───────────────────

  const activeSessionLotName = React.useMemo(() => {
    if (!activeSession) return null;
    const lot = lots.find(l => l.id === activeSession.lotId);
    return lot?.shortName ?? lot?.name ?? activeSession.lotId;
  }, [activeSession, lots]);

  // ── Dark Map Style ────────────────────────────────────────────────────

  const darkMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#101012' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#71717a' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#09090b' }] },
    { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#374151' }] },
    { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#172554' }] },
    { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#09090b' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
    { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#020617' }] },
    { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#0f766e' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#0e7490' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#155e75' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#22d3ee' }] },
    { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#1e293b' }] },
  ];

  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={mapProvider}
        style={styles.map}
        customMapStyle={darkMapStyle}
        userInterfaceStyle="dark"
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsTraffic={false}
        initialRegion={{ latitude: 40.5008, longitude: -74.4474, latitudeDelta: 0.0922, longitudeDelta: 0.0421 }}
        onRegionChangeComplete={(region) => {
          regionRef.current = region;
          setVisibleRegion(region);
          let newZoom: ZoomLevel = 'hidden';
          if (region.latitudeDelta < 0.05) newZoom = 'lot';
          else if (region.latitudeDelta < 0.6) newZoom = 'campus';
          setZoomLevel(prev => prev === newZoom ? prev : newZoom);
        }}
        onPress={() => {
          if (selectedLot) closeLotDetails();
          setSelectedPlace(null);
        }}
      >
        {/* Lot polygons + markers at zoom level 'lot' */}
        {zoomLevel === 'lot' && visibleLots.map((lot) => {
          const isSelected = selectedLot?.id === lot.id;
          const isFavorite = favorites.includes(lot.id);
          const colors = getOccupancyColor(lot.occupancyRate);

          // Each lot now contains an array of distinct polygons (for MultiPolygon support)
          const rawPolygons = lot.coordinates;

          return (
            <React.Fragment key={lot.id}>
              {rawPolygons.map((polyCoords, index) => {
                const polygonCoords = polyCoords
                  .map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
                  .filter(c => !Number.isNaN(c.latitude) && !Number.isNaN(c.longitude));

                // Convert corresponding hole rings for this specific polygon
                const holeCoords = (lot.holes[index] || [])
                  .map(ring => ring
                    .map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
                    .filter(c => !Number.isNaN(c.latitude) && !Number.isNaN(c.longitude)))
                  .filter(ring => ring.length >= 3);

                if (polygonCoords.length < 3) return null;

                return (
                  <Polygon
                    key={`${lot.id}-poly-${index}`}
                    coordinates={polygonCoords}
                    holes={holeCoords.length > 0 ? holeCoords : undefined}
                    fillColor={isSelected ? colors.bg : colors.bg}
                    strokeColor={isSelected ? '#ffffff' : colors.full}
                    strokeWidth={isSelected ? 3 : 2}
                    tappable={true}
                    zIndex={isSelected ? 10 : 1}
                    onPress={(e) => { e.stopPropagation(); handleLotPress(lot); }}
                  />
                );
              })}
              <Marker
                key={`lot-${lot.id}`}
                coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
                onPress={(e) => { e.stopPropagation(); handleLotPress(lot); }}
                zIndex={isSelected ? 11 : 2}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.dotContainer}>
                  {isSelected && (
                    <View style={styles.dotCallout}>
                      <Text style={styles.dotCalloutText}>{Math.round(lot.occupancyRate)}%</Text>
                    </View>
                  )}
                  <View style={[
                    styles.dotMarker,
                    { backgroundColor: colors.full, shadowColor: colors.glow },
                    isSelected && styles.dotMarkerSelected,
                  ]} />
                  {isFavorite && <View style={styles.favoriteDot} />}
                </View>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* Campus / region clusters */}
        {zoomLevel !== 'lot' && clusters.map((cluster) => (
          <Marker
            key={`cluster-${cluster.id}`}
            coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
            tracksViewChanges={false}
            onPress={() => {
              if (lotCooldownRef.current) return;
              lotCooldownRef.current = true;
              setTimeout(() => { lotCooldownRef.current = false; }, 650);
              mapRef.current?.animateToRegion({
                latitude: cluster.latitude,
                longitude: cluster.longitude,
                latitudeDelta: cluster.type === 'region' ? 0.05 : 0.01,
                longitudeDelta: cluster.type === 'region' ? 0.05 : 0.01,
              }, 500);
            }}
            zIndex={20}
          >
            <View style={styles.campusMarker}>
              <View style={[styles.clusterBadge, { backgroundColor: getClusterColor(cluster.occupancyRate) }]}>
                <Text style={styles.clusterText}>{cluster.name}: {Math.round(cluster.occupancyRate)}%</Text>
              </View>
            </View>
          </Marker>
        ))}

        {/* Search destination pin */}
        {selectedPlace && (
          <Marker
            coordinate={{ latitude: selectedPlace.lat, longitude: selectedPlace.lng }}
            title={selectedPlace.name}
            pinColor="#3b82f6"
          />
        )}

        {/* Detection candidate pins */}
        {pendingCandidates.map(candidate => (
          <CandidatePin
            key={candidate.lotId}
            candidate={candidate}
            horizontalAccuracy={location?.coords.accuracy}
            onPress={() => {}}
          />
        ))}
      </MapView>

      {/* ── Search Pill HUD ────────────────────────────────────────────────── */}
      <GlassCard style={styles.searchPillContainer} borderRadius={24}>
        <TouchableOpacity
          style={styles.searchPill}
          onPress={() => router.push('/(tabs)/search')}
          activeOpacity={0.75}
        >
          <IconSymbol name="magnifyingglass" size={16} color={Theme.textSecondary} />
          <Text style={styles.searchPillText}>Search lots & places…</Text>
        </TouchableOpacity>
      </GlassCard>

      {/* ── Filter button (collapses to panel on tap) ── */}
      {showFilterPanel && (
        <View style={styles.filterPanel}>
          {([
            { key: 'student',  label: '🎓 Student' },
            { key: 'employee', label: '👔 Employee' },
            { key: 'gated',    label: '🔒 Gated' },
            { key: 'ev',       label: '⚡ EV' },
          ] as const).map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.filterPanelChip, lotTypeFilter === key && styles.filterChipActive]}
              onPress={() => {
                setLotTypeFilter(prev => prev === key ? null : key);
                setShowFilterPanel(false);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterChipText, lotTypeFilter === key && styles.filterChipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Center-on-me button */}
      <GlassCard style={styles.centerButtonContainer} borderRadius={25} noShadow={false}>
        <TouchableOpacity
          style={styles.centerButton}
          onPress={() => {
            if (!location || lotCooldownRef.current) return;
            lotCooldownRef.current = true;
            setTimeout(() => { lotCooldownRef.current = false; }, 650);
            mapRef.current?.animateToRegion({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.005,
            }, 500);
          }}
          activeOpacity={0.7}
        >
          <IconSymbol name="location.fill" size={24} color={Theme.scarlet} />
        </TouchableOpacity>
      </GlassCard>

      {/* Filter button */}
      <GlassCard style={styles.filterButtonContainer} borderRadius={25} noShadow={false}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilterPanel(p => !p)}
          activeOpacity={0.7}
        >
          <IconSymbol
            name="line.3.horizontal.decrease"
            size={20}
            color={lotTypeFilter ? Theme.scarlet : Theme.textPrimary}
          />
        </TouchableOpacity>
        {lotTypeFilter && <View style={styles.filterActiveDot} />}
      </GlassCard>

      {/* Offline / sync badge */}
      {(!isOnline || pendingSyncCount > 0) && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>
            {!isOnline ? 'Offline' : `${pendingSyncCount} pending`}
          </Text>
        </View>
      )}

      {/* ── Active Session Floating Chip ── */}
      {activeSession && (
        <View style={styles.sessionChipContainer}>
          <BlurView intensity={85} tint="systemThickMaterialDark" style={StyleSheet.absoluteFill} />
          <View style={styles.sessionChipContent}>
            <View style={styles.sessionChipDot} />
            <Text style={styles.sessionChipText} numberOfLines={1}>
              {activeSessionLotName ?? 'Parked'}
            </Text>
            <View style={styles.sessionChipDivider} />
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/navigate')}
              style={styles.sessionChipAction}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <IconSymbol name="location.north.fill" size={13} color="#60a5fa" />
              <Text style={styles.sessionChipActionText}>Find Car</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Alert.alert('End Session', `End parking at ${activeSessionLotName}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'End', style: 'destructive', onPress: handleEndSession },
                ]);
              }}
              style={[styles.sessionChipAction, styles.sessionChipEnd]}
              disabled={loading}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              {loading
                ? <ActivityIndicator size="small" color="#ef4444" />
                : <Text style={styles.sessionChipEndText}>End</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Permit banner — shown when no permit is configured */}
      {!permitType && (
        <TouchableOpacity
          style={styles.permitBanner}
          onPress={() => router.push('/onboarding/permit?fromProfile=true')}
          activeOpacity={0.8}
        >
          <IconSymbol name="p.circle" size={14} color="#a1a1aa" />
          <Text style={styles.permitBannerText}>Set your permit to filter lots</Text>
          <IconSymbol name="chevron.right" size={12} color="#52525b" />
        </TouchableOpacity>
      )}

      {/* Lot Details Sheet */}
      {selectedLot && (
        <LotDetails
          key={selectedLot.id}
          lot={selectedLot}
          onClose={closeLotDetails}
          onPark={handlePark}
          isParking={loading}
          user={user}
          activeSession={activeSession}
          isFavorite={favorites.includes(selectedLot.id)}
          onToggleFavorite={() => toggleFavorite(selectedLot)}
          permitType={permitType}
        />
      )}

      {/* Detection Confirmation Sheet */}
      {pendingCandidates.length > 0 && !selectedLot && (
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
  map: { width: '100%', height: '100%' },

  // ── Search Pill HUD ───────────────────────────────────────────────────────
  searchPillContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 40,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    backgroundColor: Theme.glass,
  },
  searchPillText: {
    color: Theme.textTertiary,
    fontSize: 15,
    fontWeight: '400',
  },

  // ── Session chip (replaces the intrusive top banner) ──────────────────
  sessionChipContainer: {
    position: 'absolute',
    bottom: 105,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.scarletBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    maxWidth: 320,
  },
  sessionChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
    backgroundColor: 'rgba(24, 24, 27, 0.5)',
  },
  sessionChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.scarlet,
  },
  sessionChipText: {
    color: '#f4f4f5',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    maxWidth: 130,
  },
  sessionChipDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  sessionChipAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  sessionChipActionText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
  sessionChipEnd: {
    paddingHorizontal: 2,
  },
  sessionChipEndText: {
    color: Theme.scarlet,
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Center button ──────────────────────────────────────────────────────
  centerButtonContainer: {
    position: 'absolute',
    bottom: 110,
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  centerButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Offline badge ──────────────────────────────────────────────────────
  offlineBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(204, 0, 51, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  offlineBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // ── Permit banner ─────────────────────────────────────────────────────
  permitBanner: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.glass,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radiusLG,
    borderWidth: 0.5,
    borderColor: Theme.borderDefault,
  },
  permitBannerText: { color: Theme.textSecondary, fontSize: 12, fontWeight: '500' },

  // ── Lot dot markers ───────────────────────────────────────────────────────
  dotContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 5,
    elevation: 4,
  },
  dotMarkerSelected: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderColor: '#ffffff',
    borderWidth: 2.5,
  },
  dotCallout: {
    position: 'absolute',
    bottom: 22,
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dotCalloutText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  favoriteDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
    borderWidth: 1,
    borderColor: 'rgba(28, 28, 30, 0.8)',
  },

  // ── Lot type filter button + panel ────────────────────────────────────
  filterButtonContainer: {
    position: 'absolute',
    bottom: 170,
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  filterButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.scarlet,
    borderWidth: 1.5,
    borderColor: Theme.baseDeep,
  },
  filterPanel: {
    position: 'absolute',
    bottom: 230,
    right: 16,
    backgroundColor: Theme.glassAndroid,
    borderRadius: Theme.radiusMD,
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 2,
    borderWidth: 0.5,
    borderColor: Theme.borderDefault,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    minWidth: 150,
  },
  filterPanelChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Theme.radiusSM,
  },
  filterChipActive: {
    backgroundColor: Theme.scarlet,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  filterChipTextActive: {
    color: '#fff',
  },

  // ── Campus clusters ────────────────────────────────────────────────────
  campusMarker: { alignItems: 'center' },
  clusterBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  clusterText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
});
