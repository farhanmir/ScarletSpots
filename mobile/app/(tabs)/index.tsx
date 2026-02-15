import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Platform, Alert, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import MapView, { PROVIDER_GOOGLE, PROVIDER_DEFAULT, Polygon, Marker } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

export default function MapScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const mapRef = useRef<MapView>(null);
  const params = useLocalSearchParams();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('hidden'); 

  // Clusters computation
  const clusters = React.useMemo(() => {
    if (zoomLevel === 'lot' || zoomLevel === 'hidden') return [];

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

  const clearRouteSelectionParams = () => {
    router.setParams({
      selectedLotId: undefined,
      placeLat: undefined,
      placeLng: undefined,
      placeName: undefined,
    });
  };

  const closeLotDetails = () => {
    setSelectedLot(null);

    if (savedRegionRef.current) {
      mapRef.current?.animateToRegion(savedRegionRef.current, 500);
      savedRegionRef.current = null;
    }

    clearRouteSelectionParams();
  };

  // Handle incoming search selections
  const { selectedLotId, placeLat, placeLng, placeName } = params;

  useEffect(() => {
    if (selectedLotId) {
      const lot = lots.find(l => l.id === selectedLotId);
      if (lot) {
        setSelectedLot((prev) => {
          if (prev?.id === lot.id) {
            return prev;
          }

          mapRef.current?.animateToRegion({
            latitude: lot.latitude,
            longitude: lot.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }, 1000);

          return lot;
        });
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
      setSelectedLot(null);
    }
  }, [selectedLotId, placeLat, placeLng, placeName, lots]);

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
        Alert.alert('Location Permission Required', 'Permission to access location was denied.');
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
        // Just clear everything and showing the alert is enough
        setActiveSession(null);
        setSelectedLot(null);
        fetchLots();
        Alert.alert('Session Ended', 'Your parking session has ended.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to end session');
    } finally {
      setLoading(false);
    }
  };

  // Dual-Map Strategy: Use Google Maps on Android, Default (Apple Maps) on iOS
  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  const regionRef = useRef<any>(null); // Track current region
  const savedRegionRef = useRef<any>(null); // Save region before zooming in

  const handleLotPress = (lot: Lot) => {
    // If not already selected, save current region
    if (!selectedLot && regionRef.current) {
      savedRegionRef.current = regionRef.current;
    }
    
    setSelectedLot(lot);
    
    // Zoom in with offset for the modal
    mapRef.current?.animateToRegion({
      latitude: lot.latitude - 0.002, 
      longitude: lot.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 500);
  };

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
          if (region.latitudeDelta < 0.05) {
            setZoomLevel('lot');
          } else if (region.latitudeDelta < 0.4) {
            setZoomLevel('campus');
          } else {
            setZoomLevel('hidden');
          }
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
          return (
            <React.Fragment key={lot.id}>
              {/* Polygon - Only show when really close? or always in 'lot' mode */}
              {lot.coordinates && lot.coordinates.length >= 3 && (
                <Polygon
                  coordinates={lot.coordinates.map((p) => ({ latitude: p[0], longitude: p[1] }))}
                  fillColor={isSelected ? "rgba(220, 38, 38, 0.6)" : "rgba(220, 38, 38, 0.25)"}
                  strokeColor={isSelected ? "#ffffff" : "#dc2626"}
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
        }) : clusters.map((cluster) => (
           <Marker
            key={cluster.id}
            coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
            onPress={() => {
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
                  cluster.occupancyRate > 80 ? { backgroundColor: '#ef4444' } : 
                  cluster.occupancyRate > 50 ? { backgroundColor: '#f59e0b' } : { backgroundColor: '#059669' }
                ]}>
                   <Text style={styles.clusterText}>{cluster.name}: {Math.round(cluster.occupancyRate)}%</Text>
                </View>
             </View>
          </Marker>
        ))}

        {/* Selected Place Marker */}
        {selectedPlace && (
          <Marker
            coordinate={{ latitude: selectedPlace.lat, longitude: selectedPlace.lng }}
            title={selectedPlace.name}
            pinColor="#3b82f6"
          />
        )}
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
           <IconSymbol name="location.fill" size={24} color="#ef4444" />
         </TouchableOpacity>
      </View>

      {/* Active Session Overlay - Repositioned to not block Tab Bar */}
      {activeSession && (
        <View style={styles.activeSessionContainer}>
          <BlurView intensity={90} tint="systemThickMaterialDark" style={StyleSheet.absoluteFill} />
          <View style={styles.activeSessionContent}>
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
});
