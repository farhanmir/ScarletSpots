import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, Dimensions, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { IconSymbol } from '@/components/ui/icon-symbol';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Magnetometer } from 'expo-sensors';
import { useLocalSearchParams } from 'expo-router';
import { publicApiCall, authApiCall } from '../../lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import { useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');

// ── Math Helpers ───────────────────────────────────────────────────────────────

const deg2rad = (deg: number) => deg * (Math.PI / 180);

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 0.621371; // miles
};

const getBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
  const sLat = deg2rad(startLat);
  const sLng = deg2rad(startLng);
  const dLat = deg2rad(destLat);
  const dLng = deg2rad(destLng);
  const y = Math.sin(dLng - sLng) * Math.cos(dLat);
  const x = Math.cos(sLat) * Math.sin(dLat) - Math.sin(sLat) * Math.cos(dLat) * Math.cos(dLng - sLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

// ── Low-Pass Filter for sensor smoothing ───────────────────────────────────────

const ALPHA = 0.15; // Smoothing factor (lower = smoother, more lag)

function lowPassFilter(current: number, previous: number): number {
  return previous + ALPHA * (current - previous);
}

// ── Magnetometer heading extraction ────────────────────────────────────────────

function magnetometerToHeading(x: number, y: number): number {
  // Convert magnetometer x,y to compass heading (degrees from North)
  let angle = Math.atan2(y, x) * (180 / Math.PI);
  // Normalize: atan2 gives -180..180, we want 0..360
  // On iOS the axes may differ, but expo-sensors normalizes for us
  angle = (angle + 360) % 360;
  // Magnetometer points to magnetic north, so heading = 360 - angle
  return (360 - angle) % 360;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ParkingSession {
  id: string;
  lotId: string;
  latitude: number;
  longitude: number;
  spotNumber: string;
  startTime: string;
  lot?: { name: string; campus: string };
}

type ProximityState = 'far' | 'near' | 'here';

export default function NavigateScreen() {
  const params = useLocalSearchParams();
  const { user } = useAuth();

  // Sensor state
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [useMagnetometer, setUseMagnetometer] = useState(true);

  // High-frequency refs to avoid re-renders
  const smoothedHeading = useRef(0);
  const bearingRef = useRef(0);
  const lastHeadingRef = useRef(0);
  const rotationValue = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Navigation targets
  const [targetLot, setTargetLot] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);

  // Computed navigation state
  const [distance, setDistance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [proximityState, setProximityState] = useState<ProximityState>('far');

  // Haptic throttle
  const lastHapticRef = useRef(0);
  const lastLockOnRef = useRef(false);
  const lastFetchRef = useRef(0);

  // ── 1. Init: Permissions + Watchers ────────────────────────────────────────

  useEffect(() => {
    let headingSub: Location.LocationSubscription | undefined;
    let positionSub: Location.LocationSubscription | undefined;
    let magnetometerSub: any;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        // Try magnetometer first (more accurate heading)
        try {
          const isAvailable = await Magnetometer.isAvailableAsync();
          if (isAvailable) {
            Magnetometer.setUpdateInterval(60); // Faster update (16ms ~ 60Hz)
            magnetometerSub = Magnetometer.addListener(({ x, y }) => {
              const rawHeading = magnetometerToHeading(x, y);
              smoothedHeading.current = lowPassFilter(rawHeading, smoothedHeading.current);
              lastHeadingRef.current = smoothedHeading.current;
              // Direct animation value update (no re-render)
              rotationValue.setValue(bearingRef.current - smoothedHeading.current);
            });
            setUseMagnetometer(true);
          } else {
            throw new Error('Magnetometer not available');
          }
        } catch {
          // Fallback to GPS heading
          setUseMagnetometer(false);
          headingSub = await Location.watchHeadingAsync((obj) => {
            const h = obj.trueHeading || obj.magHeading;
            smoothedHeading.current = lowPassFilter(h, smoothedHeading.current);
            lastHeadingRef.current = smoothedHeading.current;
            rotationValue.setValue(bearingRef.current - smoothedHeading.current);
          });
        }

        // Position watcher
        positionSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 3 },
          (loc) => {
            setLocation(loc);
            if (activeTarget) {
              const b = getBearing(
                loc.coords.latitude, loc.coords.longitude,
                activeTarget.lat, activeTarget.lng
              );
              bearingRef.current = b;
              // Immediate rotation sync
              rotationValue.setValue(b - lastHeadingRef.current);
            }
          }
        );

        if (user) await fetchActiveSession();
        setLoading(false);
      } catch (err) {
        console.warn('[Navigate] Init failed:', err);
        setLoading(false);
      }
    })();

    return () => {
      headingSub?.remove();
      positionSub?.remove();
      magnetometerSub?.remove();
    };
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      // Only refresh if data is older than 60 seconds
      if (user && now - lastFetchRef.current > 60000) {
        fetchActiveSession();
        lastFetchRef.current = now;
      }
    }, [user])
  );

  // ── 2. Handle Params ──────────────────────────────────────────────────────

  useEffect(() => {
    if (params.selectedLotId) {
      fetchLotDetails(params.selectedLotId as string);
    }
  }, [params.selectedLotId]);

  const fetchActiveSession = async () => {
    try {
      const data = await authApiCall('/park/session/active');
      if (data?.session) {
        setActiveSession(data.session);
        // If we don't have a target lot from params, fetch it for the active session
        // to have fallback coordinates if the car pin is missing.
        if (!params.selectedLotId) {
          fetchLotDetails(data.session.lotId);
        }
      } else {
        setActiveSession(null);
      }
    } catch (e) {
      console.log('Error fetching session:', e);
    }
  };

  const fetchLotDetails = async (id: string) => {
    try {
      const data = await publicApiCall('/lots');
      const lot = data.lots?.find((l: any) => l.id === id);
      if (lot) setTargetLot(lot);
    } catch (e) {
      console.log('Error fetching lot for nav:', e);
    }
  };

  // ── 3. Target Resolution ─────────────────────────────────────────────────

  const activeTarget = (activeSession)
    ? { 
        lat: activeSession.latitude || targetLot?.latitude, 
        lng: activeSession.longitude || targetLot?.longitude, 
        name: activeSession.latitude ? 'Your Vehicle' : (targetLot?.name || 'Active Session'), 
        sub: activeSession.latitude ? `Spot #${activeSession.spotNumber}` : (targetLot?.campus ? `${targetLot.campus} Campus` : 'Parking Area'), 
        type: activeSession.latitude ? 'car' : 'lot' 
      }
    : (targetLot)
      ? { 
          lat: targetLot.latitude, 
          lng: targetLot.longitude, 
          name: targetLot.name, 
          sub: `${targetLot.campus} Campus`, 
          type: 'lot' 
        }
      : null;

  // ── 4. Physics + Haptics ──────────────────────────────────────────────────

  useEffect(() => {
    if (!location || !activeTarget) return;

    const distMiles = getDistance(
      location.coords.latitude, location.coords.longitude,
      activeTarget.lat, activeTarget.lng
    );
    const distFeet = distMiles * 5280;
    setDistance(distMiles);

    // Update bearing ref
    const b = getBearing(
      location.coords.latitude, location.coords.longitude,
      activeTarget.lat, activeTarget.lng
    );
    bearingRef.current = b;
    rotationValue.setValue(b - lastHeadingRef.current);

    // Proximity states
    let newProximity: ProximityState;
    if (distFeet < 50) {
      newProximity = 'here';
    } else if (distFeet < 500) {
      newProximity = 'near';
    } else {
      newProximity = 'far';
    }
    setProximityState(newProximity);

    // Haptic lock-on
    const distMeters = distMiles * 1609.34;
    const isLockedOn = distMeters <= 15;
    const now = Date.now();

    if (isLockedOn && !lastLockOnRef.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      lastLockOnRef.current = true;
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 0.8, duration: 200, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ]).start();
    } else if (!isLockedOn) {
      lastLockOnRef.current = false;
    }

    // Subtle haptic when arrow aligned (within 5°)
    const currentRot = bearingRef.current - lastHeadingRef.current;
    const normRot = ((currentRot % 360) + 540) % 360 - 180;
    if (Math.abs(normRot) < 5 && newProximity !== 'here' && now - lastHapticRef.current > 1000) {
      Haptics.selectionAsync();
      lastHapticRef.current = now;
    }
  }, [location, activeTarget]);

  // ── 5. Proximity-based theming ────────────────────────────────────────────

  const getProximityColor = () => {
    switch (proximityState) {
      case 'here': return '#10b981';  // Emerald — arrived
      case 'near': return '#f59e0b';  // Amber — getting close
      default: return '#dc2626';       // Red — far
    }
  };

  const getProximityLabel = () => {
    switch (proximityState) {
      case 'here': return 'YOU\'RE HERE';
      case 'near': return 'GETTING CLOSE';
      default: return 'NAVIGATING';
    }
  };

  const themeColor = getProximityColor();

  const formatDistance = () => {
    if (proximityState === 'here') return 'HERE';
    if (distance < 0.1) return `${Math.round(distance * 5280)} ft`;
    return `${distance.toFixed(1)} mi`;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />

      {/* Polka-dot background */}
      <View style={StyleSheet.absoluteFill}>
        {Array.from({ length: 30 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: `${(i * 23) % 100}%`,
              top: `${(i * 17) % 100}%`,
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: themeColor,
              opacity: 0.3 + ((i % 5) * 0.1),
            }}
          />
        ))}
      </View>
      <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark" />

      {/* Sensor badge */}
      <View style={styles.sensorBadge}>
        <IconSymbol
          name={useMagnetometer ? 'antenna.radiowaves.left.and.right' : 'location.fill'}
          size={12}
          color="#71717a"
        />
        <Text style={styles.sensorText}>
          {useMagnetometer ? 'Magnetometer' : 'GPS Heading'}
        </Text>
      </View>

      {!activeTarget ? (
        <View style={styles.emptyState}>
          <IconSymbol name="location.slash.fill" size={60} color="#71717a" />
          <Text style={styles.emptyText}>No destination selected.</Text>
          <Text style={styles.emptySubtext}>
            Select a lot from the map or search to start navigating.
          </Text>
        </View>
      ) : (
        <View style={styles.contentContainer}>
          {/* Distance HUD */}
          <View style={styles.hudContainer}>
            <Text style={[styles.proximityLabel, { color: themeColor }]}>
              {getProximityLabel()}
            </Text>
            <Text style={[styles.distanceText, { color: themeColor }]}>
              {formatDistance()}
            </Text>
          </View>

          {/* Compass Arrow */}
          <View style={styles.arrowContainer}>
            <Animated.View style={[styles.arrowGlow, {
              backgroundColor: themeColor,
              opacity: glowOpacity,
            }]} />
            <Animated.View style={{
              transform: [{
                rotate: rotationValue.interpolate({
                  inputRange: [-360000, 360000], // Handle many rotations
                  outputRange: ['-360000deg', '360000deg'],
                })
              }]
            }}>
              <IconSymbol name="location.north.fill" size={160} color={themeColor} />
            </Animated.View>
          </View>

          {/* Target Info */}
          <View style={styles.targetInfo}>
            <Text style={styles.targetLabel}>Navigating to</Text>
            <Text style={styles.targetName}>{activeTarget.name}</Text>
            <Text style={[styles.targetCampus, { color: themeColor }]}>
              {activeTarget.sub}
            </Text>

            {targetLot && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setTargetLot(null)}
              >
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
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sensorText: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '500',
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '75%',
    width: '100%',
    paddingBottom: 40,
  },
  hudContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  proximityLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 4,
  },
  distanceText: {
    fontSize: 64,
    fontWeight: '800',
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
  arrowGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  targetInfo: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  targetLabel: {
    fontSize: 14,
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  targetName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  targetCampus: {
    fontSize: 18,
    marginTop: 4,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  emptySubtext: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
  },
  clearButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 30,
  },
  clearButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
