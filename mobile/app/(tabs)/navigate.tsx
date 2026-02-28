import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { IconSymbol } from '@/components/ui/icon-symbol';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { authApiCall } from '../../lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import { useFocusEffect } from '@react-navigation/native';
import { getLotById, type RutgersLot } from '../../data/lots';


// ── Math Helpers ────────────────────────────────────────────────────────────

const deg2rad = (deg: number) => deg * (Math.PI / 180);

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 0.621371; // miles
};

const getBearing = (sLat: number, sLng: number, dLat: number, dLng: number): number => {
  const sl = deg2rad(sLat), sl2 = deg2rad(sLng);
  const dl = deg2rad(dLat), dl2 = deg2rad(dLng);
  const y = Math.sin(dl2 - sl2) * Math.cos(dl);
  const x = Math.cos(sl) * Math.sin(dl) - Math.sin(sl) * Math.cos(dl) * Math.cos(dl2 - sl2);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

// Low-pass filter for sensor smoothing
const ALPHA = 0.15;
const lowPass = (current: number, prev: number) => prev + ALPHA * (current - prev);

// Returns the closest equivalent of `to` relative to `from`, taking the shortest arc.
// Prevents the arrow from spinning 340° when it could go 20° the other way.
const shortestRotation = (from: number, to: number): number => {
  // Double-modulo normalises the difference to [0, 360), then shift to [-180, 180).
  let delta = ((to - from) % 360 + 360) % 360;
  if (delta > 180) delta -= 360;
  return from + delta;
};

// ── Component ───────────────────────────────────────────────────────────────

interface ParkingSession {
  id: string;
  lotId: string;
  latitude?: number;
  longitude?: number;
  spotNumber: string;
  startTime: string;
}

export default function NavigateScreen() {
  const params = useLocalSearchParams();
  const { user } = useAuth();

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);
  const [targetLot, setTargetLot] = useState<RutgersLot | null>(null);
  const [distance, setDistance] = useState(0);
  const [loading, setLoading] = useState(true);

  const smoothedHeading = useRef(0);
  const bearingRef = useRef(0);
  const lastHeadingRef = useRef(0);
  const rotationValue = useRef(new Animated.Value(0)).current;
  const cumulativeRotation = useRef(0); // tracks total rotation to take the shortest arc
  const lastFetchRef = useRef(0);

  // ── 1. Permissions + Sensors ────────────────────────────────────────────

  // Updates the animated arrow taking the shortest rotation arc.
  const applyRotation = useCallback((bearing: number, heading: number) => {
    const target = bearing - heading;
    const next = shortestRotation(cumulativeRotation.current, target);
    cumulativeRotation.current = next;
    rotationValue.setValue(next);
  }, [rotationValue]);

  // Forward declaration for exhaustive-deps
  const loadActiveSession = React.useCallback(async () => {
    try {
      const data = await authApiCall('/park/session/active');
      if (data?.session) {
        setActiveSession(data.session);
        // Look up the lot from the bundled JSON — no extra API call needed
        if (!params.selectedLotId) {
          const lot = getLotById(data.session.lotId);
          if (lot) setTargetLot(lot);
        }
      } else {
        setActiveSession(null);
      }
    } catch (e) {
      console.warn('[Navigate] Failed to load session:', e);
    }
  }, [params.selectedLotId]);

  useEffect(() => {
    let headingSub: Location.LocationSubscription | undefined;
    let positionSub: Location.LocationSubscription | undefined;
    let magnetometerSub: ReturnType<typeof Magnetometer.addListener> | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') { setLoading(false); return; }

        // Try magnetometer first for accurate heading
        try {
          const available = await Magnetometer.isAvailableAsync();
          if (cancelled) return;
          if (available) {
            Magnetometer.setUpdateInterval(60);
            magnetometerSub = Magnetometer.addListener(({ x, y }) => {
              const raw = magnetometerToHeading(x, y);
              smoothedHeading.current = lowPass(raw, smoothedHeading.current);
              lastHeadingRef.current = smoothedHeading.current;
              rotationValue.setValue(bearingRef.current - smoothedHeading.current);
            });
            setUseMagnetometer(true);
          } else {
            throw new Error('unavailable');
          }
        } catch {
          if (cancelled) return;
          setUseMagnetometer(false);
          headingSub = await Location.watchHeadingAsync((obj) => {
            const h = obj.trueHeading || obj.magHeading;
            smoothedHeading.current = lowPass(h, smoothedHeading.current);
            lastHeadingRef.current = smoothedHeading.current;
            rotationValue.setValue(bearingRef.current - smoothedHeading.current);
          });
        }

        if (cancelled) { headingSub?.remove(); return; }

        positionSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 3 },
          (loc) => { setLocation(loc); }
        );

        if (cancelled) { positionSub.remove(); return; }

        if (!cancelled) setLoading(false);
      } catch (err) {
        console.warn('[Navigate] Init failed:', err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      headingSub?.remove();
      positionSub?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sensors should only restart on user change, not on every params/loadActiveSession change
  }, [user]);

  // Load active session separately so params changes don't restart sensors
  useEffect(() => {
    if (user) loadActiveSession();
  }, [user, loadActiveSession]);

  // ── 2. Refresh on focus ────────────────────────────────────────────────

  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      if (user && now - lastFetchRef.current > 60000) {
        loadActiveSession();
        lastFetchRef.current = now;
      }
    }, [user, loadActiveSession])
  );

  // ── 3. Handle incoming params (e.g. from search tab) ──────────────────

  useEffect(() => {
    if (params.selectedLotId) {
      const lot = getLotById(params.selectedLotId as string);
      if (lot) setTargetLot(lot);
    }
  }, [params.selectedLotId]);

  // ── 4. Removed - refactored loadActiveSession above ──────────────────

  // ── 5. Target Resolution ──────────────────────────────────────────────

  const activeTarget = (() => {
    if (activeSession) {
      const hasExactCoords = activeSession.latitude != null && activeSession.longitude != null;
      return {
        lat: activeSession.latitude ?? targetLot?.latitude,
        lng: activeSession.longitude ?? targetLot?.longitude,
        name: hasExactCoords ? 'Your Vehicle' : (targetLot?.shortName ?? 'Active Session'),
        sub: hasExactCoords
          ? `Spot #${activeSession.spotNumber}`
          : (targetLot ? `${targetLot.campus} Campus` : 'Parking Area'),
      };
    }
    if (targetLot) {
      return {
        lat: targetLot.latitude,
        lng: targetLot.longitude,
        name: targetLot.shortName,
        sub: `${targetLot.campus} Campus`,
      };
    }
    return null;
  })();

  // ── 6. Update bearing + distance when location changes ────────────────

  useEffect(() => {
    if (!location || activeTarget?.lat == null || activeTarget?.lng == null) return;

    const distMiles = getDistance(
      location.coords.latitude, location.coords.longitude,
      activeTarget.lat, activeTarget.lng
    );
    setDistance(distMiles);

    const b = getBearing(
      location.coords.latitude, location.coords.longitude,
      activeTarget.lat, activeTarget.lng
    );
    bearingRef.current = b;
    applyRotation(b, lastHeadingRef.current);
  }, [location, activeTarget, applyRotation]);

  // ── 7. Format helpers ─────────────────────────────────────────────────

  const formatDistance = () => {
    if (distance < 0.1) return `${Math.round(distance * 5280)} ft`;
    return `${distance.toFixed(1)} mi`;
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />

      {/* Subtle dot grid background */}
      <View style={StyleSheet.absoluteFill}>
        {Array.from({ length: 30 }, (_, i) => (
          <View
            key={`dot-${i}`}
            style={{
              position: 'absolute',
              left: `${(i * 23) % 100}%`,
              top: `${(i * 17) % 100}%`,
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#dc2626',
              opacity: 0.15 + ((i % 5) * 0.05),
            }}
          />
        ))}
      </View>
      <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark" />

      {/* Sensor indicator */}
      <View style={styles.sensorBadge}>
        <IconSymbol name="location.fill" size={12} color="#52525b" />
        <Text style={styles.sensorText}>Compass</Text>
      </View>

      {!activeTarget || !activeTarget.lat || !activeTarget.lng ? (
        <View style={styles.emptyState}>
          <IconSymbol name="location.slash.fill" size={60} color="#3f3f46" />
          <Text style={styles.emptyText}>No destination set.</Text>
          <Text style={styles.emptySubtext}>
            Park a car or select a lot from the map to start navigating.
          </Text>
        </View>
      ) : (
        <View style={styles.contentContainer}>
          {/* Distance */}
          <View style={styles.hudContainer}>
            <Text style={styles.distanceText}>{loading ? '—' : formatDistance()}</Text>
          </View>

          {/* Compass arrow */}
          <View style={styles.arrowContainer}>
            <Animated.View style={{
              transform: [{
                rotate: rotationValue.interpolate({
                  inputRange: [-360000, 360000],
                  outputRange: ['-360000deg', '360000deg'],
                }),
              }],
            }}>
              <IconSymbol name="location.north.fill" size={160} color="#dc2626" />
            </Animated.View>
          </View>

          {/* Target info */}
          <View style={styles.targetInfo}>
            <Text style={styles.targetLabel}>Navigating to</Text>
            <Text style={styles.targetName}>{activeTarget.name}</Text>
            <Text style={styles.targetCampus}>{activeTarget.sub}</Text>

            {targetLot && !activeSession && (
              <TouchableOpacity style={styles.clearButton} onPress={() => setTargetLot(null)}>
                <Text style={styles.clearButtonText}>Clear Destination</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensorBadge: {
    position: 'absolute',
    top: 60,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  sensorText: { color: '#52525b', fontSize: 11, fontWeight: '500' },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '75%',
    width: '100%',
    paddingBottom: 40,
  },
  hudContainer: { alignItems: 'center', marginBottom: 20 },
  distanceText: {
    fontSize: 72,
    fontWeight: '800',
    color: '#dc2626',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  arrowContainer: {
    width: 240,
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetInfo: { alignItems: 'center', width: '100%', paddingHorizontal: 20 },
  targetLabel: {
    fontSize: 13,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  targetName: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  targetCampus: { fontSize: 16, color: '#a1a1aa', marginTop: 4, fontWeight: '500' },
  emptyState: { alignItems: 'center', gap: 16, padding: 20 },
  emptyText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  emptySubtext: { color: '#52525b', fontSize: 14, textAlign: 'center' },
  clearButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 30,
  },
  clearButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
