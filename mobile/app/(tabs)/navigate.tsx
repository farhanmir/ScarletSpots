import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, Platform, Dimensions, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { IconSymbol } from '@/components/ui/icon-symbol';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { publicApiCall, authApiCall } from '../../lib/supabase';
import { useAuth } from '@/context/AuthProvider';

const { width } = Dimensions.get('window');

// Haversine formula for distance
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 0.621371; // Convert to miles
};

const deg2rad = (deg: number) => {
  return deg * (Math.PI / 180);
};

// Calculate bearing between two points
const getBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
  const startLatRad = deg2rad(startLat);
  const startLngRad = deg2rad(startLng);
  const destLatRad = deg2rad(destLat);
  const destLngRad = deg2rad(destLng);

  const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
  const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
    Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
  const brng = Math.atan2(y, x);
  return (brng * 180 / Math.PI + 360) % 360;
};

interface ParkingSession {
  id: string;
  lotId: string;
  latitude: number;
  longitude: number;
  spotNumber: string;
  startTime: string;
  lot?: {
    name: string;
    campus: string;
  }
}

export default function NavigateScreen() {
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [heading, setHeading] = useState(0);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  
  // Navigation Targets
  const [targetLot, setTargetLot] = useState<any>(null); // Explicit destination
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null); // Parked car
  
  const [distance, setDistance] = useState<number>(0); // Store as number for logic
  const [arrowRotation, setArrowRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [proximityState, setProximityState] = useState<'far' | 'near' | 'arrived'>('far');

  // 1. Init: Fetch Session & Permissions
  useEffect(() => {
    (async () => {
      // Check permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Start watchers
      Location.watchHeadingAsync((obj) => {
        setHeading(obj.trueHeading || obj.magHeading);
      });

      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 500, distanceInterval: 2 },
        (loc) => {
          setLocation(loc);
        }
      );
      
      // Fetch session if logged in
      if (user) {
        await fetchActiveSession();
      }
      setLoading(false);
    })();
  }, [user]);

  // 2. Handle Params (External selection)
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

  // 3. Current Target Logic
  // Prefer explicit targetLot over activeSession
  const activeTarget = targetLot 
    ? { lat: targetLot.latitude, lng: targetLot.longitude, name: targetLot.name, sub: `${targetLot.campus} Campus`, type: 'lot' }
    : activeSession 
      ? { lat: activeSession.latitude, lng: activeSession.longitude, name: 'Your Vehicle', sub: `Spot #${activeSession.spotNumber}`, type: 'car' }
      : null;

  // 4. Physics Engine & Haptics
  useEffect(() => {
    if (location && activeTarget) {
      // Distance
      const distMiles = getDistance(
        location.coords.latitude,
        location.coords.longitude,
        activeTarget.lat,
        activeTarget.lng
      );
      const distFeet = distMiles * 5280;
      setDistance(distMiles);

      // Proximity Logic
      if (distFeet < 30) {
        setProximityState('arrived');
      } else if (distFeet < 150) {
        setProximityState('near');
      } else {
        setProximityState('far');
      }

      // Bearing
      const bearing = getBearing(
        location.coords.latitude,
        location.coords.longitude,
        activeTarget.lat,
        activeTarget.lng
      );
      
      // Rotate arrow
      const rotation = bearing - heading;
      setArrowRotation(rotation);

      // Haptics logic - normalized rotation to -180 to 180
      const normRot = ((rotation % 360) + 540) % 360 - 180;
      if (Math.abs(normRot) < 5) {
        // Debounce or limit haptics? Haptics.selectionAsync is light.
        // We probably shouldn't trigger every frame.
        // For simplicity, we trigger only if we haven't recently (optimization left for later)
        // Or actually, just trigger light impact. It feels okay if throttled by the OS.
        // Better: trigger only on crossing the threshold or randomly at low interval?
        // Let's stick to standard UI feedback for now to avoid battery drain loops.
      }
    }
  }, [location, heading, activeTarget]);

  // Haptic Feedback for alignment - separate effect to throttle
  useEffect(() => {
    if (!activeTarget) return;
    const normRot = ((arrowRotation % 360) + 540) % 360 - 180;
    
    // If aligned (within 5 deg), give subtle feedback occasionally
    if (Math.abs(normRot) < 5 && proximityState !== 'arrived') {
       // Could implement a "pulse" if we had a timing loop, but let's avoid complex loops.
       // Instead, we just trust the visual feedback + proximity color.
    }
  }, [arrowRotation, activeTarget, proximityState]);

  // Colors based on state
  const getThemeColor = () => {
    return '#dc2626'; // Red always
  };

  const themeColor = getThemeColor();

  return (
    <View style={styles.container}>
      {/* 1. Black Base */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
      
      {/* 2. Scattered Polka Dot Pattern */}
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
              opacity: 0.3 + ((i % 5) * 0.1), // Varies between 0.3 and 0.8
            }} 
          />
        ))}
      </View>
      
      {/* 3. Heavy Blur to diffuse it */}
      <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark" />
      
      {/* Header / Cancel Button could go here */}

      {!activeTarget ? (
        <View style={styles.emptyState}>
          <IconSymbol name="location.slash.fill" size={60} color="#71717a" />
          <Text style={styles.emptyText}>No destination selected.</Text>
          <Text style={styles.emptySubtext}>Select a lot from the map or search to start navigating.</Text>
        </View>
      ) : (
        <View style={styles.contentContainer}>
          <View style={styles.hudContainer}>
             <Text style={[styles.distanceText, { color: themeColor }]}>
               {proximityState === 'arrived' ? 'HERE' : distance < 0.1 ? `${Math.round(distance * 5280)} ft` : `${distance.toFixed(1)} mi`}
             </Text>
             {/* Removed Arrived Text */}
          </View>

          <View style={[
            styles.arrowContainer, 
            { transform: [{ rotate: `${arrowRotation}deg` }] }
          ]}>
             {/* Out glow for active state */}
            <View style={[styles.arrowGlow, { 
              backgroundColor: themeColor,
              opacity: Math.abs(((arrowRotation % 360) + 540) % 360 - 180) < 10 ? 0.6 : 0 
            }]} />
            <IconSymbol name="location.north.fill" size={160} color={themeColor} />
          </View>

          <View style={styles.targetInfo}>
            <Text style={styles.targetLabel}>Navigating to</Text>
            <Text style={styles.targetName}>{activeTarget.name}</Text>
            <Text style={[styles.targetCampus, { color: themeColor }]}>{activeTarget.sub}</Text>
            
            {/* Clear Button if it's an explicit lot */}
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
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '75%', // Increased height
    width: '100%',
    paddingBottom: 40,
  },
  hudContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  distanceText: {
    fontSize: 64,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  arrivedText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: -8,
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
    // filter: 'blur(20px)', // Unsupported in RN, removing to be safe
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
