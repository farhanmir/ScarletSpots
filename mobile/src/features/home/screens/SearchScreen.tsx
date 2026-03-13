import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  StatusBar,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/shared/components/ui/icon-symbol';
import * as Location from 'expo-location';
import { RUTGERS_BUILDINGS } from '@/shared/constants/buildings';
import { getAllLots, type RutgersLot } from '@/shared/constants/lots';
import { ENABLE_ALL_CAMPUSES } from '@/shared/constants/featureFlags';
import locationsData from '@/shared/constants/locations.json';

interface PlaceResult {
  id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  type: 'lot' | 'place';
  data?: RutgersLot;
}

interface LocationEntry {
  id: string;
  name: string;
  address: string;
  aliases?: string;
}

const STATIC_LOTS = getAllLots(ENABLE_ALL_CAMPUSES);

const CAMPUSES = [
  { name: 'Busch', icon: 'building.2.fill' as const, lat: 40.5231, lng: -74.4588 },
  { name: 'College Ave', icon: 'building.columns.fill' as const, lat: 40.5008, lng: -74.4474 },
  { name: 'Livingston', icon: 'leaf.fill' as const, lat: 40.5238, lng: -74.4368 },
  { name: 'Cook/Doug', icon: 'fork.knife' as const, lat: 40.4851, lng: -74.4373 },
];

const getOccupancyColor = (rate: number) => {
  if (rate >= 90) return '#ef4444';
  if (rate >= 70) return '#f59e0b';
  return '#10b981';
};

export default function SearchScreen() {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();

    const lotResults: PlaceResult[] = STATIC_LOTS
      .filter(lot =>
        lot.name.toLowerCase().includes(lowerQuery) ||
        lot.campus.toLowerCase().includes(lowerQuery) ||
        lot.shortName.toLowerCase().includes(lowerQuery)
      )
      .map(lot => ({
        id: lot.id,
        name: lot.name,
        address: `${lot.campus} Campus`,
        latitude: lot.latitude,
        longitude: lot.longitude,
        type: 'lot' as const,
        data: lot,
      }));

    const buildingResults: PlaceResult[] = RUTGERS_BUILDINGS
      .filter(place => place.name.toLowerCase().includes(lowerQuery))
      .map((place, index) => ({
        id: `building-${index}`,
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        type: 'place' as const,
      }));

    const locationResults: PlaceResult[] = (locationsData as LocationEntry[])
      .filter(loc =>
        loc.name.toLowerCase().includes(lowerQuery) ||
        (loc.aliases && loc.aliases.toLowerCase().includes(lowerQuery))
      )
      .map(loc => ({
        id: `loc-${loc.id}`,
        name: loc.name,
        address: loc.address,
        type: 'place' as const,
      }));

    const combinedPlaces = [...buildingResults, ...locationResults];
    const uniquePlaces = Array.from(new Map(combinedPlaces.map(item => [item.name, item])).values());

    setResults([...lotResults, ...uniquePlaces].slice(0, 50));

    if (query.length > 3) {
      setSearching(true);
      const searchTimeout = setTimeout(async () => {
        try {
          const contextualQuery = `${query} New Brunswick, NJ`;
          const geocodeResults = await Location.geocodeAsync(contextualQuery);
          if (geocodeResults?.length > 0 && mountedRef.current) {
            const firstResult = geocodeResults[0];
            setResults(prev => [...prev, {
              id: `native-${Date.now()}`,
              name: query,
              address: 'Custom Location (New Brunswick Area)',
              latitude: firstResult.latitude,
              longitude: firstResult.longitude,
              type: 'place' as const,
            }]);
          }
        } catch {
          // ignore geocoding errors
        } finally {
          if (mountedRef.current) setSearching(false);
        }
      }, 500);
      return () => clearTimeout(searchTimeout);
    } else {
      setSearching(false);
    }
  }, [query]);

  const handleSelect = async (item: PlaceResult) => {
    Keyboard.dismiss();
    if (item.type === 'lot') {
      router.push({ pathname: '/(tabs)' as any, params: { selectedLotId: item.id } });
    } else {
      let lat = item.latitude;
      let lng = item.longitude;

      if (!lat || !lng) {
        setSearching(true);
        try {
          const searchTerm = item.address ? item.address : `${item.name} New Brunswick, NJ`;
          const geocodeResults = await Location.geocodeAsync(searchTerm);
          if (geocodeResults && geocodeResults.length > 0) {
            lat = geocodeResults[0].latitude;
            lng = geocodeResults[0].longitude;
          }
        } catch {
          // ignore geocoding errors
        } finally {
          setSearching(false);
        }
      }

      if (lat && lng) {
        router.push({ pathname: '/(tabs)' as any, params: { placeLat: lat, placeLng: lng, placeName: item.name } });
      } else {
        Alert.alert('Location Not Found', 'Could not determine the coordinates for this location.');
      }
    }
  };

  const lotResults = results.filter(r => r.type === 'lot');
  const placeResults = results.filter(r => r.type === 'place');

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#0f0f12', '#09090b']} style={StyleSheet.absoluteFill} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Search</Text>
          <Text style={styles.subtitle}>Lots, buildings & places</Text>

          <View style={[styles.searchBar, isFocused && styles.searchBarFocused]}>
            <IconSymbol name="magnifyingglass" size={18} color={isFocused ? '#dc2626' : '#52525b'} />
            <TextInput
              style={styles.input}
              placeholder="Lots, buildings, addresses…"
              placeholderTextColor="#3f3f46"
              value={query}
              onChangeText={setQuery}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <IconSymbol name="xmark.circle.fill" size={18} color="#52525b" />
              </TouchableOpacity>
            ) : searching ? (
              <View style={styles.searchingDot} />
            ) : null}
          </View>
        </View>

        {query.length === 0 ? (
          <FlatList
            data={[]}
            keyExtractor={() => ''}
            renderItem={null}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.emptyBody}
            ListHeaderComponent={
              <>
                <Text style={styles.sectionLabel}>CAMPUSES</Text>
                <View style={styles.campusRow}>
                  {CAMPUSES.map(c => (
                    <TouchableOpacity
                      key={c.name}
                      style={styles.campusPill}
                      onPress={() => handleSelect({ id: `c-${c.name}`, name: c.name, latitude: c.lat, longitude: c.lng, type: 'place' })}
                      activeOpacity={0.75}
                    >
                      <IconSymbol name={c.icon} size={15} color="#dc2626" />
                      <Text style={styles.campusPillText}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.sectionLabel, { marginTop: 28 }]}>POPULAR LOTS</Text>
                {STATIC_LOTS.slice(0, 6).map(lot => (
                  <TouchableOpacity
                    key={lot.id}
                    style={styles.popularRow}
                    onPress={() => handleSelect({ id: lot.id, name: lot.name, latitude: lot.latitude, longitude: lot.longitude, type: 'lot', address: `${lot.campus} Campus`, data: lot })}
                    activeOpacity={0.75}
                  >
                    <View style={styles.popularIcon}>
                      <IconSymbol name="car.fill" size={15} color="#dc2626" />
                    </View>
                    <View style={styles.popularText}>
                      <Text style={styles.popularName}>{lot.name}</Text>
                      <Text style={styles.popularSub}>{lot.campus} · {lot.capacity} spots</Text>
                    </View>
                    <View style={[styles.occupancyPill, { borderColor: getOccupancyColor(lot.occupancyRate) + '40' }]}>
                      <View style={[styles.occupancyDot, { backgroundColor: getOccupancyColor(lot.occupancyRate) }]} />
                      <Text style={[styles.occupancyText, { color: getOccupancyColor(lot.occupancyRate) }]}>
                        {Math.round(lot.occupancyRate)}%
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            }
          />
        ) : results.length === 0 && !searching ? (
          <View style={styles.noResultsWrap}>
            <IconSymbol name="magnifyingglass" size={40} color="#27272a" />
            <Text style={styles.noResultsTitle}>No results</Text>
            <Text style={styles.noResultsSub}>Try a lot name, campus, or building</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.resultsList}
            renderItem={({ item, index }) => {
              const prevItem = results[index - 1];
              const showLotHeader = item.type === 'lot' && (index === 0 || prevItem?.type !== 'lot');
              const showPlaceHeader = item.type === 'place' && (index === 0 || prevItem?.type !== 'place');
              return (
                <>
                  {showLotHeader && lotResults.length > 0 && (
                    <Text style={styles.sectionLabel}>PARKING LOTS</Text>
                  )}
                  {showPlaceHeader && placeResults.length > 0 && (
                    <Text style={[styles.sectionLabel, lotResults.length > 0 && { marginTop: 24 }]}>PLACES</Text>
                  )}
                  <TouchableOpacity style={styles.resultCard} onPress={() => handleSelect(item)} activeOpacity={0.75}>
                    <View style={[styles.resultIcon, item.type === 'place' && styles.resultIconPlace]}>
                      <IconSymbol
                        name={item.type === 'lot' ? 'car.fill' : 'mappin.and.ellipse'}
                        size={18}
                        color={item.type === 'lot' ? '#dc2626' : '#3b82f6'}
                      />
                    </View>
                    <View style={styles.resultText}>
                      <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.resultAddr} numberOfLines={1}>{item.address ?? 'Unknown Location'}</Text>
                    </View>
                    {item.type === 'lot' && item.data && (
                      <View style={[styles.occupancyPill, { borderColor: getOccupancyColor(item.data.occupancyRate) + '40' }]}>
                        <View style={[styles.occupancyDot, { backgroundColor: getOccupancyColor(item.data.occupancyRate) }]} />
                        <Text style={[styles.occupancyText, { color: getOccupancyColor(item.data.occupancyRate) }]}>
                          {Math.round(item.data.occupancyRate)}%
                        </Text>
                      </View>
                    )}
                    {item.type === 'place' && (
                      <IconSymbol name="chevron.right" size={14} color="#3f3f46" />
                    )}
                  </TouchableOpacity>
                </>
              );
            }}
          />
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fafafa',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#52525b',
    marginTop: 2,
    marginBottom: 18,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111113',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    borderWidth: 1.5,
    borderColor: '#27272a',
    gap: 10,
  },
  searchBarFocused: {
    borderColor: '#dc2626',
    backgroundColor: '#130d0d',
  },
  input: {
    flex: 1,
    color: '#f4f4f5',
    fontSize: 16,
    padding: 0,
  },
  searchingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#dc2626',
    opacity: 0.7,
  },

  emptyBody: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#52525b',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },
  campusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  campusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.18)',
  },
  campusPillText: {
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: '600',
  },

  popularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
    gap: 12,
  },
  popularIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popularText: { flex: 1 },
  popularName: {
    color: '#e4e4e7',
    fontSize: 15,
    fontWeight: '600',
  },
  popularSub: {
    color: '#52525b',
    fontSize: 12,
    marginTop: 2,
  },

  occupancyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  occupancyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  occupancyText: {
    fontSize: 12,
    fontWeight: '700',
  },

  resultsList: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    paddingTop: 4,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111113',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1f1f23',
    gap: 12,
  },
  resultIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultIconPlace: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  resultText: { flex: 1 },
  resultName: {
    color: '#f4f4f5',
    fontSize: 15,
    fontWeight: '600',
  },
  resultAddr: {
    color: '#52525b',
    fontSize: 12,
    marginTop: 2,
  },

  noResultsWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -80,
    gap: 10,
  },
  noResultsTitle: {
    color: '#52525b',
    fontSize: 17,
    fontWeight: '600',
  },
  noResultsSub: {
    color: '#3f3f46',
    fontSize: 13,
  },
});
