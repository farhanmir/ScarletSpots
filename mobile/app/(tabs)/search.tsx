import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Keyboard,
  TouchableWithoutFeedback
} from 'react-native';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { publicApiCall } from '../../lib/supabase';
import * as Location from 'expo-location';

// Types
interface Lot {
  id: string;
  name: string;
  campus: string;
  latitude: number;
  longitude: number;
  capacity: number;
  occupiedCount: number;
  occupancyRate: number;
}

interface PlaceResult {
  id: string; // 'place-' + index
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  type: 'lot' | 'place';
  data?: Lot; // If it's a lot, store the full object
}

export default function SearchScreen() {
  const router = useRouter();
  
  const [query, setQuery] = useState('');
  const [lots, setLots] = useState<Lot[]>([]);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  // Fetch lots on mount
  useEffect(() => {
    fetchLots();
  }, []);

  // Filter lots when query changes
  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    
    // 1. Filter Lots
    const lotResults: PlaceResult[] = lots
      .filter(lot => 
        lot.name.toLowerCase().includes(lowerQuery) || 
        lot.campus.toLowerCase().includes(lowerQuery)
      )
      .map(lot => ({
        id: lot.id,
        name: lot.name,
        address: `${lot.campus} Campus`,
        latitude: lot.latitude,
        longitude: lot.longitude,
        type: 'lot',
        data: lot
      }));

    setResults(lotResults);

    // 2. Geocode for Places (Debounced)
    const timer = setTimeout(async () => {
      if (query.length > 3) {
        setSearching(true);
        try {
          // Attempt to Geocode
          // We can't strictly bias `geocodeAsync` without native APIs, but we can filter the results.
          // Rutgers New Brunswick approx center: 40.5008, -74.4474
          const RUTGERS_LAT = 40.5008;
          const RUTGERS_LNG = -74.4474;
          
          const geocoded = await Location.geocodeAsync(query);
          
          if (geocoded && geocoded.length > 0) {
             const placeResults: PlaceResult[] = geocoded
              .filter(geo => {
                // Filter results to be within ~5 miles (~0.08 degrees) of Rutgers New Brunswick
                // This ensures we only show buildings/places relevant to the campus area.
                const latDiff = Math.abs(geo.latitude - RUTGERS_LAT);
                const lngDiff = Math.abs(geo.longitude - RUTGERS_LNG);
                return latDiff < 0.08 && lngDiff < 0.08; 
              })
              .slice(0, 3)
              .map((geo, index) => ({
                id: `place-${index}`,
                name: query, 
                address: 'Near Rutgers', // Generic label since geocoder is simple
                latitude: geo.latitude,
                longitude: geo.longitude,
                type: 'place'
              }));
            
            setResults(prev => {
              // Combine and dedupe based on ID or Name logic if needed
              // For now, just appending the filtered places
              return [...prev, ...placeResults];
            });
          }
        } catch (e) {
          console.log('Geocoding error', e);
        } finally {
          setSearching(false);
        }
      }
    }, 1000); // 1s debounce

    return () => clearTimeout(timer);

  }, [query, lots]);

  const fetchLots = async () => {
    try {
      const data = await publicApiCall('/lots');
      setLots(data.lots || []);
    } catch (error) {
      console.error('Error fetching lots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (item: PlaceResult) => {
    Keyboard.dismiss();
    
    if (item.type === 'lot') {
      // Use push or navigate to ensure we switch tabs correctly with params
      router.push({
        pathname: '/(tabs)',
        params: {
          selectedLotId: item.id,
        }
      });
    } else {
      router.push({
        pathname: '/(tabs)',
        params: { 
          placeLat: item.latitude, 
          placeLng: item.longitude, 
          placeName: item.name 
        }
      });
    }
  };

  const getOccupancyColor = (rate: number) => {
    if (rate >= 90) return '#ef4444'; // Red
    if (rate >= 70) return '#f59e0b'; // Amber
    return '#10b981'; // Emerald
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        {/* Search Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Where to?</Text>
          <View style={styles.searchBar}>
            <IconSymbol name="magnifyingglass" size={20} color="#a1a1aa" />
            <TextInput
              style={styles.input}
              placeholder="Search lots, campuses, or places..."
              placeholderTextColor="#71717a"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <IconSymbol name="xmark.circle.fill" size={18} color="#71717a" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Results List */}
        <View style={styles.resultsContainer}>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color="#dc2626" />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 100 }}
              ListEmptyComponent={
                query.length > 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>
                      {searching ? 'Searching places...' : 'No specific results found'}
                    </Text>
                    {!searching && (
                      <View style={{ marginTop: 24, width: '100%' }}>
                        <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Try a Campus</Text>
                        {[
                          { name: 'Busch Campus', lat: 40.5231, lng: -74.4588 },
                          { name: 'College Avenue', lat: 40.5008, lng: -74.4474 },
                          { name: 'Livingston', lat: 40.5238, lng: -74.4368 },
                          { name: 'Cook/Douglass', lat: 40.4851, lng: -74.4373 },
                        ].map((campus) => (
                           <TouchableOpacity 
                            key={campus.name} 
                            style={styles.suggestionItem}
                            onPress={() => handleSelect({
                              id: `campus-${campus.name}`,
                              name: campus.name,
                              address: 'Rutgers University',
                              latitude: campus.lat,
                              longitude: campus.lng,
                              type: 'place'
                            } as any)}
                          >
                            <IconSymbol name="mappin.and.ellipse" size={16} color="#71717a" />
                            <Text style={styles.suggestionText}>{campus.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.suggestionContainer}>
                    <Text style={styles.sectionTitle}>Suggestions</Text>
                    {lots.slice(0, 5).map(lot => (
                      <TouchableOpacity 
                        key={lot.id} 
                        style={styles.suggestionItem}
                        onPress={() => handleSelect({
                          id: lot.id,
                          name: lot.name,
                          latitude: lot.latitude,
                          longitude: lot.longitude,
                          type: 'lot',
                          campus: lot.campus,
                          data: lot
                        } as any)}
                      >
                        <IconSymbol name="clock" size={16} color="#71717a" />
                        <Text style={styles.suggestionText}>{lot.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              }
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.resultItem}
                  onPress={() => handleSelect(item)}
                >
                  <View style={styles.iconContainer}>
                    <IconSymbol 
                      name={item.type === 'lot' ? 'car.fill' : 'mappin.and.ellipse'} 
                      size={24} 
                      color={item.type === 'lot' ? '#dc2626' : '#3b82f6'} 
                    />
                  </View>
                  
                  <View style={styles.textContainer}>
                    <Text style={styles.resultName}>{item.name}</Text>
                    <Text style={styles.resultAddress}>{item.address || 'Unknown Location'}</Text>
                  </View>

                  {item.type === 'lot' && item.data && (
                    <View style={styles.occupancyContainer}>
                      <View 
                        style={[
                          styles.occupancyDot, 
                          { backgroundColor: getOccupancyColor(item.data.occupancyRate) }
                        ]} 
                      />
                      <Text style={styles.occupancyText}>
                        {Math.round(item.data.occupancyRate)}%
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b', // Zinc-950
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#09090b',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f4f4f5',
    marginBottom: 15,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b', // Zinc-900
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  input: {
    flex: 1,
    marginLeft: 10,
    color: '#f4f4f5',
    fontSize: 16,
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#18181b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  resultName: {
    color: '#e4e4e7',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  resultAddress: {
    color: '#71717a',
    fontSize: 13,
  },
  occupancyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  occupancyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  occupancyText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#52525b',
    fontSize: 14,
  },
  suggestionContainer: {
    marginTop: 20,
  },
  sectionTitle: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
  },
  suggestionText: {
    color: '#d4d4d8',
    fontSize: 15,
    marginLeft: 12,
  },
});
