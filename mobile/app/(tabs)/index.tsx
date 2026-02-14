import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Platform, Alert, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { PROVIDER_GOOGLE, PROVIDER_DEFAULT, Polygon, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { publicApiCall, authApiCall } from '../../lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import LotDetails from '../../components/LotDetails';
import { IconSymbol } from '@/components/ui/icon-symbol';

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
  isCustom?: boolean;
}

interface ParkingSession {
  id: string;
  lotId: string;
  startTime: string;
  endTime?: string;
  spotNumber: string;
}

export default function MapScreen() {
  const { session, user } = useAuth();
  const mapRef = useRef<MapView>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);
  const [loading, setLoading] = useState(false);

  const darkMapStyle = [
    {
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#202124"
        }
      ]
    },
    {
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#9aa0a6"
        }
      ]
    },
    {
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#202124"
        }
      ]
    },
    {
      "featureType": "administrative.country",
      "elementType": "geometry.stroke",
      "stylers": [
        {
          "color": "#4b6878"
        }
      ]
    },
    {
      "featureType": "administrative.land_parcel",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#64779e"
        }
      ]
    },
    {
      "featureType": "administrative.province",
      "elementType": "geometry.stroke",
      "stylers": [
        {
          "color": "#4b6878"
        }
      ]
    },
    {
      "featureType": "landscape.man_made",
      "elementType": "geometry.stroke",
      "stylers": [
        {
          "color": "#334e87"
        }
      ]
    },
    {
      "featureType": "landscape.natural",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#202124"
        }
      ]
    },
    {
      "featureType": "poi",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#283d6a"
        }
      ]
    },
    {
      "featureType": "poi",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#6f9ba5"
        }
      ]
    },
    {
      "featureType": "poi",
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#1d2c4d"
        }
      ]
    },
    {
      "featureType": "poi.park",
      "elementType": "geometry.fill",
      "stylers": [
        {
          "color": "#202124"
        }
      ]
    },
    {
      "featureType": "poi.park",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#3C7680"
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#304a7d"
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#98a5be"
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#1d2c4d"
        }
      ]
    },
    {
      "featureType": "road.highway",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#2c6675"
        }
      ]
    },
    {
      "featureType": "road.highway",
      "elementType": "geometry.stroke",
      "stylers": [
        {
          "color": "#255763"
        }
      ]
    },
    {
      "featureType": "road.highway",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#b0d5ce"
        }
      ]
    },
    {
      "featureType": "road.highway",
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#023e58"
        }
      ]
    },
    {
      "featureType": "transit",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#98a5be"
        }
      ]
    },
    {
      "featureType": "transit",
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#1d2c4d"
        }
      ]
    },
    {
      "featureType": "transit.line",
      "elementType": "geometry.fill",
      "stylers": [
        {
          "color": "#283d6a"
        }
      ]
    },
    {
      "featureType": "transit.station",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#3a4762"
        }
      ]
    },
    {
      "featureType": "water",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#0e1626"
        }
      ]
    },
    {
      "featureType": "water",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#4e6d87"
        }
      ]
    }
  ];

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);
    })();
    
    fetchLots();
  }, []);

  useEffect(() => {
    if (user) {
      fetchActiveSession();
    } else {
      setActiveSession(null);
    }
  }, [user]);

  const fetchLots = async () => {
    try {
      const data = await publicApiCall('/lots');
      setLots(data.lots || []);
    } catch (error) {
      console.error('Error fetching lots:', error);
    }
  };

  const fetchActiveSession = async () => {
    try {
      const data = await authApiCall('/park/session/active');
      if (data?.session) {
        setActiveSession(data.session);
      } else {
        setActiveSession(null);
      }
    } catch (error) {
      console.error('Error fetching active session:', error);
    }
  };

  const handlePark = async (lot: Lot) => {
    if (!user) return;
    setLoading(true);
    try {
      const spotNumber = Math.floor(Math.random() * 1000).toString(); // Simulate spot selection
      const data = await authApiCall('/park/session', {
        method: 'POST',
        body: JSON.stringify({
          lotId: lot.id,
          spotNumber,
          latitude: location?.coords.latitude,
          longitude: location?.coords.longitude,
          confirmed: true,
        }),
      });
      
      if (data.success) {
        Alert.alert('Success', `Parking session started at Spot #${spotNumber}`);
        setActiveSession(data.session);
        setSelectedLot(null);
        fetchLots(); // Refresh occupancy
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start parking session');
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

      if (data.success) {
        Alert.alert('Session Ended', 'Your parking session has ended.');
        setActiveSession(null);
        fetchLots();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to end session');
    } finally {
      setLoading(false);
    }
  };

  // Dual-Map Strategy: Use Google Maps on Android, Default (Apple Maps) on iOS
  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

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
          latitude: 40.5008, // Rutgers generic center
          longitude: -74.4474,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        onPress={() => setSelectedLot(null)}
      >
        {lots.map((lot) => (
          <React.Fragment key={lot.id}>
            {/* Render Polygon if coordinates exist */}
            {lot.coordinates && lot.coordinates.length >= 3 && (
              <Polygon
                coordinates={lot.coordinates.map((p) => ({ latitude: p[0], longitude: p[1] }))}
                fillColor="rgba(220, 38, 38, 0.25)"
                strokeColor="#dc2626"
                strokeWidth={2}
                tappable={true}
                onPress={() => setSelectedLot(lot)}
              />
            )}
            
            {/* Custom Red Marker */}
            <Marker
              coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
              title={lot.name}
              description={`${lot.campus} - ${Math.round(lot.occupancyRate)}% Full`}
              onPress={() => setSelectedLot(lot)}
            >
              <View style={styles.markerContainer}>
                <View style={[
                  styles.markerBubble,
                  lot.occupancyRate > 80 && styles.markerFull,
                ]}>
                  <Text style={styles.markerText}>
                    {Math.round(lot.occupancyRate)}%
                  </Text>
                </View>
                <View style={[
                  styles.markerArrow,
                  lot.occupancyRate > 80 && styles.markerArrowFull,
                ]} />
              </View>
            </Marker>
          </React.Fragment>
        ))}
      </MapView>

      {/* Center on Me Button */}
      <TouchableOpacity
        style={styles.centerButton}
        onPress={() => {
          if (location) {
            mapRef.current?.animateToRegion({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.005,
            }, 500);
          }
        }}
        activeOpacity={0.8}
      >
        <IconSymbol name="location.fill" size={20} color="#dc2626" />
      </TouchableOpacity>

      {/* Active Session Overlay */}
      {activeSession && (
        <View style={styles.activeSessionContainer}>
          <View>
            <Text style={styles.activeSessionText}>Active Parking Session</Text>
            <Text style={styles.activeSessionSubtext}>Spot #{activeSession.spotNumber}</Text>
          </View>
          <TouchableOpacity 
            style={styles.endSessionButton} 
            onPress={handleEndSession}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.endSessionText}>End</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Lot Details Sheet */}
      {selectedLot && !activeSession && (
        <LotDetails 
          lot={selectedLot} 
          onClose={() => setSelectedLot(null)} 
          onPark={handlePark}
          isParking={loading}
          user={user}
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
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  activeSessionText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  activeSessionSubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  endSessionButton: {
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  endSessionText: {
    color: '#dc2626',
    fontWeight: 'bold',
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
    backgroundColor: '#b91c1c',
  },
  markerText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
  },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#dc2626',
    marginTop: -1,
  },
  markerArrowFull: {
    borderTopColor: '#b91c1c',
  },
  centerButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 100,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(10, 10, 10, 0.85)' : '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});
