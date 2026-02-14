import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import MapView, { PROVIDER_GOOGLE, PROVIDER_DEFAULT, Polygon, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { apiCall } from '../../lib/supabase';

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

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);

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

  const fetchLots = async () => {
    try {
      const data = await apiCall('/lots');
      setLots(data.lots || []);
    } catch (error) {
      console.error('Error fetching lots:', error);
    }
  };

  // Dual-Map Strategy: Use Google Maps on Android, Default (Apple Maps) on iOS
  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  return (
    <View style={styles.container}>
      <MapView
        provider={mapProvider}
        style={styles.map}
        showsUserLocation={true}
        showsMyLocationButton={true}
        initialRegion={{
          latitude: 40.5008, // Rutgers generic center
          longitude: -74.4474,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
      >
        {lots.map((lot) => (
          <React.Fragment key={lot.id}>
            {/* Render Polygon if coordinates exist */}
            {lot.coordinates && lot.coordinates.length >= 3 && (
              <Polygon
                coordinates={lot.coordinates.map((p) => ({ latitude: p[0], longitude: p[1] }))}
                fillColor={lot.isCustom ? "rgba(59, 130, 246, 0.4)" : "rgba(220, 38, 38, 0.4)"}
                strokeColor={lot.isCustom ? "#3b82f6" : "#dc2626"}
                strokeWidth={2}
              />
            )}
            
            {/* Render Marker */}
            <Marker
              coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
              title={lot.name}
              description={`${lot.campus} - ${Math.round(lot.occupancyRate)}% Full`}
              pinColor={lot.isCustom ? "blue" : "red"}
            />
          </React.Fragment>
        ))}
      </MapView>
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
});
