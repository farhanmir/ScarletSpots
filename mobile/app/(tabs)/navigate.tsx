import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/context/AuthProvider';
import { authApiCall } from '@/lib/supabase';

const { width, height } = Dimensions.get('window');

export default function NavigateScreen() {
  const { session } = useAuth();
  const [carLocation, setCarLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [bearing, setBearing] = useState<number>(0);
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Pulse animation for the arrow
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  // Get user's active parking session to find car location
  useEffect(() => {
    const fetchCarLocation = async () => {
      try {
        if (!session) {
          setLoading(false);
          return;
        }
        const data = await authApiCall('/session/active');
        if (data.session && data.session.latitude && data.session.longitude) {
          setCarLocation({
            lat: data.session.latitude,
            lng: data.session.longitude,
          });
        }
      } catch {
        // No active session — that's fine
      } finally {
        setLoading(false);
      }
    };
    fetchCarLocation();
  }, [session]);

  // Watch user heading + position
  useEffect(() => {
    let headingSub: Location.LocationSubscription | null = null;
    let locationSub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      headingSub = await Location.watchHeadingAsync((h) => {
        setHeading(h.trueHeading ?? h.magHeading ?? 0);
      });

      locationSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 2 },
        (loc) => setUserLocation(loc)
      );
    })();

    return () => {
      headingSub?.remove();
      locationSub?.remove();
    };
  }, []);

  // Calculate bearing and distance to car
  useEffect(() => {
    if (!userLocation || !carLocation) return;

    const lat1 = (userLocation.coords.latitude * Math.PI) / 180;
    const lat2 = (carLocation.lat * Math.PI) / 180;
    const dLng = ((carLocation.lng - userLocation.coords.longitude) * Math.PI) / 180;

    // Bearing
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const bearingRad = Math.atan2(y, x);
    const bearingDeg = ((bearingRad * 180) / Math.PI + 360) % 360;
    setBearing(bearingDeg);

    // Distance (Haversine)
    const R = 6371000;
    const dLat = lat2 - lat1;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    setDistance(R * c);
  }, [userLocation, carLocation]);

  // Arrow rotation = bearing to car minus user's heading
  const arrowRotation = carLocation ? ((bearing - heading + 360) % 360) : 0;

  // Format distance
  const formatDistance = (m: number) => {
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1)} km`;
  };

  // No car saved state
  if (!loading && !carLocation) {
    return (
      <View style={styles.container}>
        <View style={styles.noCarContainer}>
          <View style={styles.noCarIconCircle}>
            <IconSymbol name="car.fill" size={48} color="rgba(255,255,255,0.15)" />
          </View>
          <Text style={styles.noCarTitle}>No Car Parked</Text>
          <Text style={styles.noCarSubtext}>
            Start a parking session on the map{'\n'}and we'll guide you back to your car
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Title */}
      <Text style={styles.title}>Navigate to Car</Text>

      {/* Big Arrow */}
      <View style={styles.arrowArea}>
        <Animated.View
          style={[
            styles.arrowCircle,
            pulseStyle,
            { transform: [{ rotate: `${arrowRotation}deg` }] },
          ]}
        >
          <LinearGradient
            colors={['rgba(220,38,38,0.3)', 'rgba(220,38,38,0.05)']}
            style={styles.arrowGradient}
          />
          <View style={styles.arrowInner}>
            <IconSymbol name="location.north.fill" size={64} color="#dc2626" />
          </View>
        </Animated.View>
      </View>

      {/* Distance */}
      {distance !== null && (
        <View style={styles.distanceContainer}>
          <Text style={styles.distanceValue}>{formatDistance(distance)}</Text>
          <Text style={styles.distanceLabel}>to your car</Text>
        </View>
      )}

      {/* Hint */}
      <Text style={styles.hint}>Point your phone forward and follow the arrow</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  // Title
  title: {
    color: '#e4e4e7',
    fontSize: 18,
    fontWeight: '600',
    position: 'absolute',
    top: Platform.OS === 'ios' ? 70 : 50,
  },

  // Arrow
  arrowArea: {
    marginBottom: 40,
  },
  arrowCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  arrowGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 90,
  },
  arrowInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Distance
  distanceContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  distanceValue: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1,
  },
  distanceLabel: {
    color: '#71717a',
    fontSize: 16,
    marginTop: 4,
  },

  // Hint
  hint: {
    color: '#3f3f46',
    fontSize: 13,
    textAlign: 'center',
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 120 : 100,
  },

  // No car state
  noCarContainer: {
    alignItems: 'center',
    gap: 16,
  },
  noCarIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  noCarTitle: {
    color: '#e4e4e7',
    fontSize: 22,
    fontWeight: '700',
  },
  noCarSubtext: {
    color: '#52525b',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
