import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Platform, Alert, Text, TouchableOpacity, ActivityIndicator, AppState } from 'react-native';
import { BlurView } from 'expo-blur';
import MapView, { PROVIDER_GOOGLE, PROVIDER_DEFAULT, Polygon, Marker } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApiCall, publicApiCall, supabase } from '../../lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import LotDetails from '../../components/LotDetails';
import ParkingConfirmationSheet from '../../components/ParkingConfirmationSheet';
import CandidatePin from '../../components/Map/CandidatePin';
import FriendMarkers from '../../components/Map/FriendMarkers';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useSettings } from '@/context/SettingsContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPendingParkingCandidates, clearPendingParkingCandidates } from '../../services/BackgroundTasks';
import { type ParkingCandidate } from '../../services/ParkingDetectionService';
import { registerLotGeofences } from '../../services/GeofenceManager';
import { fetchWithOfflineFallback, clearCachedSession } from '../../services/OfflineCache';
import {
  initOfflineQueue,
  queueParkAction,
  addQueueListener,
  getPendingCount,
} from '../../services/OfflineQueue';

interface Lot {
  id: string;
  name: string;
  campus: string;
  latitude: number;
  longitude: number;
  capacity: number;
  occupiedCount: number;
  coordinates?: number[][];
  occupancyRate: number;
  is_custom?: boolean;
}

interface ParkingSession {
  id: string;
  lotId: string;
  startTime: string;
  endTime?: string;
  spotNumber: string;
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

// Helper for dynamic lot coloring
const getOccupancyColor = (rate: number) => {
  if (rate >= 90) return { full: '#ef4444', bg: 'rgba(239, 68, 68, 0.6)' }; // Red
  if (rate >= 70) return { full: '#f59e0b', bg: 'rgba(245, 158, 11, 0.6)' }; // Amber
  return { full: '#10b981', bg: 'rgba(16, 185, 129, 0.6)' }; // Emerald (Green)
};

const getClusterColor = (rate: number) => {
  if (rate > 80) return '#ef4444';
  if (rate > 50) return '#f59e0b';
  return '#059669';
};



export default function MapScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const mapRef = useRef<MapView>(null);
  const params = useLocalSearchParams();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('campus');
  const [currentRegion, setCurrentRegion] = useState<any>(null);
  const [pendingCandidates, setPendingCandidates] = useState<ParkingCandidate[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  // Offline sync state
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const { showFriends } = useSettings();

  const isFocused = useIsFocused();

  // ── Offline Queue Init ─────────────────────────────────────────────────────
  useEffect(() => {
    // Start the background network listener that auto-flushes queued actions
    initOfflineQueue();

    // Subscribe to queue depth changes so we can show the sync badge
    const unsubscribeQueue = addQueueListener(count => {
      setPendingSyncCount(count);
    });

    // Bootstrap: read current queue depth + network state
    getPendingCount().then(setPendingSyncCount);
    NetInfo.fetch().then(state => {
      setIsOnline(!!state.isConnected);
    });

    // Live network badge
    const unsubscribeNet = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });

    return () => {
      unsubscribeQueue();
      unsubscribeNet();
      // Note: we do NOT teardown the queue here because other screens can queue actions.
      // Only call teardownOfflineQueue() when the entire app unmounts (in _layout).
    };
  }, []);

  // ── Lot Data ────────────────────────────────────────────────────────────
  //
  // Two-tier caching strategy:
  //  • Stale time 24 h — lot names, coordinates, polygon shapes almost never change.
  //    A single fetch hydrates the day. Hot reloads re-use the in-memory cache.
  //  • Occupancy data (occupancyRate, occupiedCount) does change — the query
  //    re-fetches on a 2-minute interval ONLY when the map screen is focused.
  //  • refetchOnMount:false ensures developer hot-reloads don’t spam the API.
  //
  const { data: lots = [], refetch: refetchOccupancy } = useQuery<Lot[]>({
    queryKey: ['lots'],
    queryFn: async () => {
      // Do NOT pass a staleThresholdMs here — the cache guard inside
      // fetchWithOfflineFallback would silently return the cached copy every
      // time React Query polls (every 30 s), meaning other users' sessions
      // would never show up. We let React Query own the staleness window;
      // the offline cache is only used when the device is truly offline.
      const result = await fetchWithOfflineFallback(
        async () => {
          const res = await publicApiCall('/lots');
          return res.data ?? res.lots ?? res ?? [];
        },
        'offline_cache_lots'
      );
      return result.data;
    },
    staleTime: 0,                                        // Always consider lots data stale so polls go through
    refetchInterval: isFocused ? 1000 * 15 : false,      // Poll occupancy every 15 s when map is visible
    refetchOnMount: true,            // Re-fetch on every mount when stale (clears ghost lots on tab switch)
    refetchOnWindowFocus: false,
  });

  // Derive selectedLot from lots array whenever lots or selectedLotId changes
  const selectedLot = React.useMemo(() => {
    if (!selectedLotId) return null;
    return lots.find(l => l.id === selectedLotId) || null;
  }, [lots, selectedLotId]);

  // ── Active Session (React Query) ───────────────────────────────────────────
  //
  // Replaces the imperative fetchActiveSession() + useEffect([user]) pattern
  // which was firing a fresh auth+session request on every single re-mount.
  //
  const { data: sessionData } = useQuery<{ session: ParkingSession | null }>({
    queryKey: ['session', 'active'],
    queryFn: async () => {
      const result = await fetchWithOfflineFallback(
        async () => {
          const data = await authApiCall('/park/session/active');
          return data;
        },
        'offline_cache_session',
        1000 * 60 * 1 // 1 min threshold
      );
      return result.data ?? { session: null };
    },
    enabled: !!user,             // Only run when logged in
    staleTime: 1000 * 60 * 2.5,  // Session is fresh for 2.5 mins (sync with detector)
    refetchOnMount: false,       
    refetchOnWindowFocus: false,
  });

  // Derive activeSession from query data (falls back to null so UI stays unchanged)
  const activeSession = sessionData?.session ?? null;

  // Clusters computation
  const clusters = React.useMemo(() => {
    if (zoomLevel === 'lot') return [];

    if (zoomLevel === 'hidden') {
      // Rutgers University central pin when zoomed way out
      return [{
        id: 'university-rutgers',
        type: 'region',
        name: 'Rutgers University',
        latitude: 40.5008, 
        longitude: -74.4474,
        occupancyRate: lots.length > 0 ? lots.reduce((acc, lot) => acc + lot.occupancyRate, 0) / lots.length : 0,
        count: lots.length
      } as Cluster];
    }

    // Campus Clusters
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
      name: name,
      latitude: data.lat / data.count,
      longitude: data.lng / data.count,
      occupancyRate: data.occupancySum / data.count,
      count: data.count
    } as Cluster));

  }, [lots, zoomLevel]);

  const regionRef = useRef<any>(null); // Track current region
  const savedRegionRef = useRef<any>(null); // Save region before zooming in
  const lotCooldownRef = useRef(false); // Prevent rapid open/close cycles
  const prevLotsJsonRef = useRef<string>(''); // Track lots changes for side-effects

  const clearRouteSelectionParams = () => {
    router.setParams({
      selectedLotId: undefined,
      placeLat: undefined,
      placeLng: undefined,
      placeName: undefined,
    });
  };

  const closeLotDetails = useCallback(() => {
    // If already selecting/closing or animating, ignore
    if (lotCooldownRef.current) return;
    
    // Only proceed if a lot is actually selected
    if (!selectedLotId) return;

    lotCooldownRef.current = true;
    setTimeout(() => { lotCooldownRef.current = false; }, 650);

    setSelectedLotId(null);

    if (savedRegionRef.current && AppState.currentState === 'active') {
      mapRef.current?.animateToRegion(savedRegionRef.current, 500);
      savedRegionRef.current = null;
    }

    clearRouteSelectionParams();
  }, [selectedLotId]);

  const fetchFavorites = async () => {
    if (!user) return;
    try {
      const data = await authApiCall('/favorites');
      if (data?.favorite_lots) {
        setFavorites(data.favorite_lots.map((l: any) => l.id));
      }
    } catch (e) {
      console.error('Failed to fetch favorites:', e);
    }
  };

  useEffect(() => {
    if (user) fetchFavorites();
  }, [user]);

  const toggleFavorite = async (lot: Lot) => {
    if (!user) return;
    const isFavorite = favorites.includes(lot.id);
    
    // Optimistic UI update
    if (isFavorite) {
      setFavorites(prev => prev.filter(id => id !== lot.id));
    } else {
      setFavorites(prev => [...prev, lot.id]);
    }

    try {
      if (isFavorite) {
        await authApiCall(`/favorites/${lot.id}`, { method: 'DELETE' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await authApiCall(`/favorites/${lot.id}`, { method: 'POST' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      // Rollback on error
      console.warn('[MapScreen] Failed to update favorite:', e);
      if (isFavorite) {
        setFavorites(prev => [...prev, lot.id]);
      } else {
        setFavorites(prev => prev.filter(id => id !== lot.id));
      }
      Alert.alert('Error', 'Failed to update favorites');
    }
  };

  // Handle incoming search selections
  const { placeLat, placeLng, placeName } = params;
  const selectedLotIdFromParams = params.selectedLotId as string | undefined;

  useEffect(() => {
    if (selectedLotIdFromParams) {
      const lot = lots.find(l => l.id === selectedLotIdFromParams);
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
      const name = placeName as string || 'Destination';
      
      setSelectedPlace((prev) => {
        if (prev?.lat === lat && prev?.lng === lng) {
          return prev;
        }

        mapRef.current?.animateToRegion({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 1000);

        return { lat, lng, name };
      });
      setSelectedLotId(null);
    }
  }, [selectedLotIdFromParams, placeLat, placeLng, placeName, lots]);

  useEffect(() => {
    if (lots.length > 0) {
      // Only run heavy side-effects (AsyncStorage write, geofence registration)
      // when the lots data actually changed — not on every 15-second poll that
      // returns the same list. Comparing a lightweight fingerprint avoids
      // O(n) deep-equals.
      // Only re-register geofences if the LOT LIST or COORDINATES changed.
      // OccupancyRate changes every 15s, but geofences don't care about that.
      const staticFingerprint = lots.map(l => `${l.id}:${l.latitude}:${l.longitude}`).join(',');
      if (staticFingerprint !== prevLotsJsonRef.current) {
        prevLotsJsonRef.current = staticFingerprint;
        AsyncStorage.setItem('cached_lots', JSON.stringify(lots)).catch(() => {});
        registerLotGeofences(lots).catch(err => console.warn('[MapScreen] Geofence registration failed:', err));
      }

      setSelectedLotId(prevId => {
        if (prevId && !lots.find(l => l.id === prevId)) {
          if (savedRegionRef.current) {
            mapRef.current?.animateToRegion(savedRegionRef.current, 500);
            savedRegionRef.current = null;
          }
          return null;
        }
        return prevId;
      });
    }
  }, [lots]);

  const darkMapStyle = [
    {
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#101012" // Zinc-950 (Darker than #18181b)
        }
      ]
    },
    {
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#71717a" // Zinc-500
        }
      ]
    },
    {
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#09090b" // Zinc-950
        }
      ]
    },
    {
      "featureType": "administrative.country",
      "elementType": "geometry.stroke",
      "stylers": [
        {
          "color": "#374151" // Gray-700
        }
      ]
    },
    {
      "featureType": "administrative.land_parcel",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#4b5563"
        }
      ]
    },
    {
      "featureType": "administrative.province",
      "elementType": "geometry.stroke",
      "stylers": [
        {
          "color": "#374151"
        }
      ]
    },
    {
      "featureType": "landscape.man_made",
      "elementType": "geometry.stroke",
      "stylers": [
        {
          "color": "#172554" // Blue-950
        }
      ]
    },
    {
      "featureType": "landscape.natural",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#09090b"
        }
      ]
    },
    {
      "featureType": "poi",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#0f172a" // Slate-900
        }
      ]
    },
    {
      "featureType": "poi",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#64748b"
        }
      ]
    },
    {
      "featureType": "poi",
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#020617"
        }
      ]
    },
    {
      "featureType": "poi.park",
      "elementType": "geometry.fill",
      "stylers": [
        {
          "color": "#020617" // Slate-950 (Deepest Park)
        }
      ]
    },
    {
      "featureType": "poi.park",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#0f766e" // Teal-700
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#0f172a" // Slate-900 (Very Dark Roads)
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#475569"
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#020617"
        }
      ]
    },
    {
      "featureType": "road.highway",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#0e7490" // Cyan-700 (Slightly darker Highway)
        }
      ]
    },
    {
      "featureType": "road.highway",
      "elementType": "geometry.stroke",
      "stylers": [
        {
          "color": "#155e75" // Cyan-800
        }
      ]
    },
    {
      "featureType": "road.highway",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#22d3ee" // Cyan-400 (Pop)
        }
      ]
    },
    {
      "featureType": "road.highway",
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#083344"
        }
      ]
    },
    {
      "featureType": "transit",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#475569"
        }
      ]
    },
    {
      "featureType": "transit",
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#020617"
        }
      ]
    },
    {
      "featureType": "transit.line",
      "elementType": "geometry.fill",
      "stylers": [
        {
          "color": "#0f172a"
        }
      ]
    },
    {
      "featureType": "transit.station",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#0f172a"
        }
      ]
    },
    {
      "featureType": "water",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#000000" // True Black water
        }
      ]
    },
    {
      "featureType": "water",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#1e293b"
        }
      ]
    }
  ];

  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Location Permission Required', 'Permission to access location was denied.');
          return;
        }

        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      } catch (err) {
        console.warn('[MapScreen] Location init failed:', err);
      }
    })();
  }, []);

  const latestLocationRef = useRef(location);
  useEffect(() => {
    latestLocationRef.current = location;
  }, [location]);

  // Periodic Location Reporting for Friends
  useEffect(() => {
    if (!user || !isFocused) return;

    // We only report/broadcast if the app is active to save battery and prevent background crashes
    let dbInterval: any = null;
    let broadcastInterval: any = null;
    let channel: any = null;

    const setupSync = () => {
      // Cleanup existing if any (edge case)
      if (dbInterval) clearInterval(dbInterval);
      if (broadcastInterval) clearInterval(broadcastInterval);
      if (channel) supabase.removeChannel(channel);

      if (AppState.currentState !== 'active') return;

      console.log('[MapScreen] Setting up location sync channel...');
      // Supabase Channel for broadcasting
      channel = supabase.channel(`user-location:${user.id}`, {
        config: { broadcast: { self: false } }
      });
      
      const reportToDB = async () => {
        const currentLoc = latestLocationRef.current;
        if (!currentLoc) return;
        
        try {
          await authApiCall('/users/me/location', {
            method: 'POST',
            body: JSON.stringify({
              latitude: currentLoc.coords.latitude,
              longitude: currentLoc.coords.longitude,
            }),
          });
        } catch (err) {
          console.log('[MapScreen] DB location report failed:', err);
        }
      };

      const broadcastLocation = () => {
        const currentLoc = latestLocationRef.current;
        if (!currentLoc) return;

        if (channel && channel.state === 'joined') {
          channel.send({
            type: 'broadcast',
            event: 'location_update',
            payload: {
              userId: user.id,
              latitude: currentLoc.coords.latitude,
              longitude: currentLoc.coords.longitude,
              timestamp: new Date().toISOString(),
            },
          });
        }
      };

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          broadcastLocation();
        }
      });

      reportToDB();
      dbInterval = setInterval(reportToDB, 1000 * 60);
      broadcastInterval = setInterval(broadcastLocation, 1000 * 10);
    };

    const cleanupSync = () => {
      console.log('[MapScreen] Cleaning up location sync channel...');
      if (dbInterval) clearInterval(dbInterval);
      if (broadcastInterval) clearInterval(broadcastInterval);
      if (channel) supabase.removeChannel(channel);
      dbInterval = null;
      broadcastInterval = null;
      channel = null;
    };

    setupSync();

    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        setupSync();
      } else {
        cleanupSync();
      }
    });

    return () => {
      cleanupSync();
      appStateSub.remove();
    };
  }, [user, isFocused]); // Removed 'location' from dependencies to prevent thrashing

  useEffect(() => {
    if (user) {
      // Session is now managed by useQuery above; just check for pending detection
      checkPendingParking();
    } else {
      // Clear the cached session when the user signs out
      queryClient.setQueryData(['session', 'active'], { session: null });
      setPendingCandidates([]);
    }
  }, [user]);

  const checkPendingParking = async () => {
    const candidates = await getPendingParkingCandidates();
    if (candidates.length > 0) {
      setPendingCandidates(candidates);
    }
  };

  const updateOptimisticOccupancy = (lotId: string, delta: number) => {
    console.log(`[Occupancy] Optimistic update for ${lotId} with delta ${delta}`);
    queryClient.setQueryData(['lots'], (old: Lot[] | undefined) => {
      if (!old) return old;
      return old.map(lot => {
        if (String(lot.id) === String(lotId)) {
          const newOcc = Math.max(0, (lot.occupiedCount || 0) + delta);
          return {
            ...lot,
            occupiedCount: newOcc,
            occupancyRate: lot.capacity > 0 ? (newOcc / lot.capacity * 100) : 0
          };
        }
        return lot;
      });
    });
  };

  const handlePark = async (lotId: string) => {
    if (!user) return;
    
    // Find the lot object from the ID
    const lot = lots.find(l => l.id === lotId);
    if (!lot) {
        Alert.alert('Error', 'Lot not found');
        return;
    }

    setLoading(true);
    try {
      // Validate lot ID is a proper UUID before sending to backend
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(lot.id)) {
        Alert.alert('Cannot Park', 'Custom lots do not support parking sessions yet.');
        setLoading(false);
        return;
      }

      const spotNumber = Math.floor(Math.random() * 1000).toString();
      const payload = {
        lotId: lot.id,
        spotNumber,
        latitude: location?.coords.latitude,
        longitude: location?.coords.longitude,
        confirmed: true,
      };

      // ── Offline path: queue and surface optimistic session ──
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await queueParkAction('PARK', payload);
        // Show an optimistic "offline" session so the user sees feedback
        const optimisticSession: ParkingSession = {
          id: `offline-${Date.now()}`,
          lotId: lot.id,
          startTime: new Date().toISOString(),
          spotNumber,
        };
        queryClient.setQueryData(['session', 'active'], { session: optimisticSession });
        updateOptimisticOccupancy(lot.id, 1);
        setSelectedLotId(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Parked Offline 📵',
          `You’re parked at Spot #${spotNumber}. Your session will sync automatically when you’re back online.`,
        );
        return;
      }

      // ── Online path ──
      const data = await authApiCall('/park/session', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      
      if (data?.success) {
        // Guard: synthesize a local session when _offline path returned no
        // data.session (e.g. fetch-failure fallback that previously returned
        // only { success, _offline }). This ensures the active-session banner
        // always appears immediately, regardless of which offline path fired.
        const session: ParkingSession = data.session ?? {
          id: `offline-${Date.now()}`,
          lotId: lot.id,
          spotNumber,
          startTime: new Date().toISOString(),
        };
        if (data._offline) {
          Alert.alert('Parked Offline 📵', `Your session at ${lot.name} will sync when back online.`);
        } else {
          Alert.alert('Success', `Parking session started at ${lot.name}`);
        }
        queryClient.setQueryData(['session', 'active'], { session });
        updateOptimisticOccupancy(lot.id, 1);
        setSelectedLotId(null);
        // Do NOT call refetchOccupancy() here — it returns the AsyncStorage
        // cache (fresh < 10 min) and overwrites the optimistic update.
        // The 5-min polling interval will sync with the server automatically.
      }
    } catch (error: any) {
      // Network error during an "online" attempt → fall back to queue
      if (
        error?.message?.toLowerCase().includes('network') ||
        error?.message?.toLowerCase().includes('timeout') ||
        error?.code === 'ECONNABORTED'
      ) {
        const lot2 = lots.find(l => l.id === lotId);
        if (!lot2) {
          Alert.alert('Error', 'Lot not found');
          return;
        }
        const spotNumber = Math.floor(Math.random() * 1000).toString();
        await queueParkAction('PARK', {
          lotId: lot2.id,
          spotNumber,
          latitude: location?.coords.latitude,
          longitude: location?.coords.longitude,
          confirmed: true,
        });
        updateOptimisticOccupancy(lot2.id, 1);
        // Optimistic UI updated via queryClient
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Alert.alert('Error', error.message || 'Failed to start parking session');
      }
    } finally {
      setLoading(false);
    }
  };


  const handleEndSession = async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      const data = await authApiCall('/park/session/end', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (data?.success) {
        const lotIdToRemove = activeSession.lotId;
        queryClient.setQueryData(['session', 'active'], { session: null });
        updateOptimisticOccupancy(lotIdToRemove, -1);
        clearCachedSession().catch(() => {});
        setSelectedLotId(null);
        setSelectedPlace(null);
        clearRouteSelectionParams();
        // Do NOT call refetchOccupancy() here — it returns the AsyncStorage
        // cache (fresh < 10 min) and overwrites the optimistic update.
        Alert.alert('Session Ended', 'Your parking session has ended.');
      } else if (!data) {
        // authApiCall returned null (no auth session / signed out)
        queryClient.setQueryData(['session', 'active'], { session: null });
        clearCachedSession().catch(() => {});
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to end session');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmParking = async (candidate: ParkingCandidate) => {
    if (!user) return;
    setIsConfirming(true);
    try {
      const payload = {
        lotId: candidate.lotId,
        spotNumber: 'Auto-detected',
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        confirmed: true,
      };

      // ── Offline path ──
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await queueParkAction('CONFIRM_DETECTED', payload);
        const optimisticSession2: ParkingSession = {
          id: `offline-${Date.now()}`,
          lotId: candidate.lotId,
          startTime: new Date().toISOString(),
          spotNumber: 'Auto-detected',
        };
        queryClient.setQueryData(['session', 'active'], { session: optimisticSession2 });
        updateOptimisticOccupancy(candidate.lotId, 1);
        await clearPendingParkingCandidates();
        setPendingCandidates([]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      // ── Online path ──
      const data = await authApiCall('/park/session', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      
      if (data?.success) {
        queryClient.setQueryData(['session', 'active'], { session: data.session });
        updateOptimisticOccupancy(candidate.lotId, 1);
        await clearPendingParkingCandidates();
        setPendingCandidates([]);
        // Do NOT call refetchOccupancy() here — AsyncStorage cache is fresh
        // and would overwrite the optimistic update.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      // Network error → queue it
      console.warn('[MapScreen] handleConfirmParking network error, queuing:', error?.message);
      await queueParkAction('CONFIRM_DETECTED', {
        lotId: candidate.lotId,
        spotNumber: 'Auto-detected',
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        confirmed: true,
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


  // Dual-Map Strategy: Use Google Maps on Android, Default (Apple Maps) on iOS
  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  const handleLotPress = useCallback((lot: Lot) => {
    // Prevent rapid open/close cycles that cause competing native animations
    if (lotCooldownRef.current) return;
    // If the same lot is already showing, do nothing.
    if (selectedLotId === lot.id) return;

    lotCooldownRef.current = true;
    setTimeout(() => { lotCooldownRef.current = false; }, 650);

    // Save current region so we can restore it on close - ONLY if no lot is currently selected
    // to avoid overwriting the "original" view with a zoomed-in one during rapid clicks.
    if (!selectedLotId && regionRef.current && !savedRegionRef.current) {
      savedRegionRef.current = regionRef.current;
    }

    setSelectedLotId(lot.id);
    
    // Zoom in with offset for the modal - ONLY if app is active
    if (AppState.currentState === 'active') {
      mapRef.current?.animateToRegion({
        latitude: lot.latitude - 0.002, 
        longitude: lot.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 500);
    }
  }, [selectedLotId]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={mapProvider}
        style={styles.map}
        customMapStyle={darkMapStyle}
        userInterfaceStyle="dark"
        showsUserLocation={true}
        showsMyLocationButton={true}
        showsTraffic={false}
        initialRegion={{
          latitude: 40.5008, 
          longitude: -74.4474,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        onRegionChangeComplete={(region) => {
          regionRef.current = region;
          
          // Determine Zoom Level
          let newZoom: ZoomLevel = 'hidden';
          if (region.latitudeDelta < 0.05) {
            newZoom = 'lot';
          } else if (region.latitudeDelta < 0.6) {
            newZoom = 'campus';
          }

          // Only update state when the zoom band or region actually changed
          // to avoid re-rendering the entire marker tree on every pan.
          setZoomLevel(prev => prev === newZoom ? prev : newZoom);
          setCurrentRegion((prev: any) => {
            // Skip update if delta hasn't changed enough to matter
            if (prev && Math.abs(prev.latitude - region.latitude) < 0.0001
                     && Math.abs(prev.longitude - region.longitude) < 0.0001
                     && Math.abs(prev.latitudeDelta - region.latitudeDelta) < 0.0001) {
              return prev;
            }
            return region;
          });
        }}
        onPress={() => {
           // Only close if we are selecting something? behavior preference
           if (selectedLot) {
             closeLotDetails();
           }
           setSelectedPlace(null);
        }}
      >
        {zoomLevel === 'lot' ? lots.map((lot) => {
          const isSelected = selectedLot?.id === lot.id;
          const isFavorite = favorites.includes(lot.id);
          const colors = getOccupancyColor(lot.occupancyRate);
          
          let polygonCoords: any[] = [];
          if (lot.coordinates && Array.isArray(lot.coordinates)) {
             polygonCoords = lot.coordinates
               .map((p: any) => ({
                 latitude: Number(Array.isArray(p) ? p[0] : (p.latitude ?? p.lat)),
                 longitude: Number(Array.isArray(p) ? p[1] : (p.longitude ?? p.lng))
               }))
               .filter((c) => !isNaN(c.latitude) && !isNaN(c.longitude));
          }

          return (
            <React.Fragment key={lot.id}>
              {/* Polygon */}
              {polygonCoords.length >= 3 && (
                <Polygon
                  coordinates={polygonCoords}
                  fillColor={isSelected ? "rgba(220, 38, 38, 0.6)" : colors.bg}
                  strokeColor={isSelected ? "#ffffff" : colors.full}
                  strokeWidth={isSelected ? 3 : 2}
                  tappable={true}
                  zIndex={isSelected ? 10 : 1}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleLotPress(lot);
                  }}
                />
              )}
              
              {/* Marker */}
              <Marker
                coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
                onPress={(e) => {
                  e.stopPropagation();
                  handleLotPress(lot);
                }}
                zIndex={isSelected ? 11 : 2}
              >
                <View style={[styles.markerContainer, isSelected && { transform: [{ scale: 1.2 }] }]}>
                  <View style={[
                    styles.markerBubble,
                    { backgroundColor: colors.full },
                    isSelected && { borderColor: '#fff', borderWidth: 2 }
                  ]}>
                    <Text style={styles.markerText}>
                      {Math.round(lot.occupancyRate)}%
                    </Text>
                    {isFavorite && (
                      <View style={styles.favoriteBadge}>
                        <IconSymbol name="star.fill" size={10} color="#f59e0b" />
                      </View>
                    )}
                  </View>
                  <View style={[
                    styles.markerArrow,
                    { borderTopColor: colors.full },
                    isSelected && { borderTopColor: '#fff' }
                  ]} />
                </View>
              </Marker>
            </React.Fragment>
          );
        }) : clusters.map((cluster) => (
           <Marker
            key={cluster.id}
            coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
            onPress={() => {
              if (lotCooldownRef.current) return;
              lotCooldownRef.current = true;
              setTimeout(() => { lotCooldownRef.current = false; }, 650);

              // Zoom in on cluster
               mapRef.current?.animateToRegion({
                latitude: cluster.latitude,
                longitude: cluster.longitude,
                latitudeDelta: cluster.type === 'region' ? 0.05 : 0.01, // Zoom deeper
                longitudeDelta: cluster.type === 'region' ? 0.05 : 0.01,
              }, 500);
            }}
            zIndex={20}
          >
             <View style={styles.campusMarker}>
                {/* Simplified Marker: Just the badge with Name + % */}
                <View style={[
                  styles.clusterBadge,
                  { backgroundColor: getClusterColor(cluster.occupancyRate) },
                ]}>
                   <Text style={styles.clusterText}>{cluster.name}: {Math.round(cluster.occupancyRate)}%</Text>
                </View>
             </View>
          </Marker>
        ))}

        {/* Friend Markers (Phase 3 Feature) */}
        {showFriends && <FriendMarkers region={currentRegion} />}

        {/* Selected Place Marker */}
        {selectedPlace && (
          <Marker
            coordinate={{ latitude: selectedPlace.lat, longitude: selectedPlace.lng }}
            title={selectedPlace.name}
            pinColor="#3b82f6"
          />
        )}

        {/* Candidate Pins */}
        {pendingCandidates.map(candidate => (
          <CandidatePin
            key={candidate.lotId}
            candidate={candidate}
            horizontalAccuracy={location?.coords.accuracy}
            onPress={() => {}}
          />
        ))}

      </MapView>

      {/* Center on Me Button - Styled like LiquidGlassTabBar */}
      <View style={styles.centerButtonContainer}>
         {Platform.OS === 'ios' && (
            <BlurView intensity={80} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
         )}
         <TouchableOpacity
           style={[styles.centerButton, Platform.OS === 'android' && styles.centerButtonAndroid]}
           onPress={() => {
             if (location) {
               if (lotCooldownRef.current) return;
               lotCooldownRef.current = true;
               setTimeout(() => { lotCooldownRef.current = false; }, 650);

               mapRef.current?.animateToRegion({
                 latitude: location.coords.latitude,
                 longitude: location.coords.longitude,
                 latitudeDelta: 0.01,
                 longitudeDelta: 0.005,
               }, 500);
             }
           }}
           activeOpacity={0.7}
         >
           <IconSymbol name="location.fill" size= {24} color="#ef4444" />
         </TouchableOpacity>
      </View>

      {/* Active Session Overlay - Repositioned to not block Tab Bar */}
      {activeSession && (
        <View style={styles.activeSessionContainer}>
          <BlurView intensity={90} tint="systemThickMaterialDark" style={StyleSheet.absoluteFill} />
          <View style={styles.activeSessionContent}>
            <View>
              <Text style={styles.activeSessionText}>Active Parking Session</Text>
              <Text style={styles.activeSessionSubtext}>
                {lots.find(l => String(l.id) === String(activeSession.lotId))?.name || 'In Progress'}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.endSessionButton} 
              onPress={handleEndSession}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="white" /> : <Text style={styles.endSessionText}>End</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* LotDetails Sheet */}
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
        />
      )}

      {/* Parking Detection Confirmation */}
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
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  activeSessionContainer: {
    position: 'absolute',
    top: 60, // Moved to TOP instead of bottom to avoid blocking tabs
    left: 20,
    right: 20,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  activeSessionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(24, 24, 27, 0.6)', 
  },
  activeSessionText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 16,
  },
  activeSessionSubtext: {
    color: '#d4d4d8',
    fontSize: 14,
    marginTop: 2,
  },
  endSessionButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  endSessionText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  markerContainer: {
    alignItems: 'center',
  },
  markerBubble: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 40,
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  markerFull: {
    backgroundColor: '#10b981', // Success green for available
  },
  markerText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  markerArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#dc2626',
    transform: [{ translateY: -1 }],
  },
  markerArrowFull: {
    borderTopColor: '#10b981',
  },
  centerButtonContainer: {
    position: 'absolute',
    bottom: 110, // Above the tab bar
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  centerButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(12, 12, 12, 0.3)', // Default for iOS glass
  },
  centerButtonAndroid: {
    backgroundColor: '#18181b', // Solid for Android
  },
  campusMarker: {
    // Transparent container, we rely on the badge now
    alignItems: 'center',
  },
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
  clusterText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  favoriteBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#18181b',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
});
