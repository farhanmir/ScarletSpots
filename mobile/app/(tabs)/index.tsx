import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Platform, Alert, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { PROVIDER_GOOGLE, PROVIDER_DEFAULT, Polygon, Marker } from 'react-native-maps';
import { useLocalSearchParams } from 'expo-router';
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
  const params = useLocalSearchParams();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);
  const [loading, setLoading] = useState(false);

  // Handle incoming search selections
  const { selectedLotId, placeLat, placeLng, placeName } = params;

  useEffect(() => {
    if (selectedLotId) {
      const lot = lots.find(l => l.id === selectedLotId);
      if (lot && selectedLot?.id !== lot.id) {
        setSelectedLot(lot);
        setSelectedPlace(null);
        mapRef.current?.animateToRegion({
          latitude: lot.latitude,
          longitude: lot.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 1000);
      }
    } else if (placeLat && placeLng) {
      const lat = parseFloat(placeLat as string);
      const lng = parseFloat(placeLng as string);
      const name = placeName as string || 'Destination';
      
      // Check if place is already selected to prevent loop
      if (!selectedPlace || selectedPlace.lat !== lat || selectedPlace.lng !== lng) {
        setSelectedPlace({ lat, lng, name });
        setSelectedLot(null);
        
        mapRef.current?.animateToRegion({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 1000);
      }
    }
  }, [selectedLotId, placeLat, placeLng, placeName, lots, selectedLot, selectedPlace]);

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
        onPress={() => {
          setSelectedLot(null);
          setSelectedPlace(null);
        }}
      >
        {lots.map((lot) => {
          const isSelected = selectedLot?.id === lot.id;
          return (
            <React.Fragment key={lot.id}>
              {/* Render Polygon if coordinates exist */}
              {lot.coordinates && lot.coordinates.length >= 3 && (
                <Polygon
                  coordinates={lot.coordinates.map((p) => ({ latitude: p[0], longitude: p[1] }))}
                  fillColor={isSelected ? "rgba(220, 38, 38, 0.6)" : "rgba(220, 38, 38, 0.25)"}
                  strokeColor={isSelected ? "#ffffff" : "#dc2626"}
                  strokeWidth={isSelected ? 3 : 2}
                  tappable={true}
                  zIndex={isSelected ? 10 : 1}
                  onPress={() => setSelectedLot(lot)}
                />
              )}
              
              {/* Custom Red Marker - properties unchanged */}
              <Marker
                coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
                title={lot.name}
                description={`${lot.campus} - ${Math.round(lot.occupancyRate)}% Full`}
                onPress={() => setSelectedLot(lot)}
                zIndex={isSelected ? 11 : 2}
              >
                <View style={[styles.markerContainer, isSelected && { transform: [{ scale: 1.2 }] }]}>
                  <View style={[
                    styles.markerBubble,
                    lot.occupancyRate > 80 && styles.markerFull,
                    isSelected && { borderColor: '#fff', borderWidth: 2 }
                  ]}>
                    <Text style={styles.markerText}>
                      {Math.round(lot.occupancyRate)}%
                    </Text>
                  </View>
                  <View style={[
                    styles.markerArrow,
                    lot.occupancyRate > 80 && styles.markerArrowFull,
                    isSelected && { borderTopColor: '#fff' }
                  ]} />
                </View>
              </Marker>
            </React.Fragment>
          );
        })}

        
        {/* Selected Place Marker (from Search) */}
        {selectedPlace && (
          <Marker
            coordinate={{ latitude: selectedPlace.lat, longitude: selectedPlace.lng }}
            title={selectedPlace.name}
            pinColor="#3b82f6" // Blue pin for places
          />
        )}
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
