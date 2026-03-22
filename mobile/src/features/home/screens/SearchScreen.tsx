import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  StatusBar,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import { GlassCard } from "@/shared/components/ui/GlassCard";
import { GlassSearchBar } from "@/shared/components/ui/GlassSearchBar";
import { ScarletSpotsBackground } from "@/shared/components/ui/ScarletSpotsBackground";
import { GLASS } from "@/shared/components/ui/glassTheme";
import * as Location from "expo-location";
import { RUTGERS_BUILDINGS } from "@/shared/constants/buildings";
import { getAllLots, type RutgersLot } from "@/shared/constants/lots";
import { ENABLE_ALL_CAMPUSES } from "@/shared/constants/featureFlags";
import locationsData from "@/shared/constants/locations.json";

interface PlaceResult {
  id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  type: "lot" | "place";
  data?: RutgersLot;
}

interface LocationEntry {
  id: string;
  name: string;
  address: string;
  aliases?: string;
}

const STATIC_LOTS = getAllLots(ENABLE_ALL_CAMPUSES);

const getOccupancyColor = (rate: number) => {
  if (rate >= 90) return "#ef4444";
  if (rate >= 70) return "#f59e0b";
  return "#10b981";
};

const FLAT_CARD_BG = "#1c1d21";
const FLAT_CARD_BORDER = "rgba(255,255,255,0.11)";

export default function SearchScreen() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();

    const lotResults: PlaceResult[] = STATIC_LOTS.filter(
      (lot) =>
        lot.name.toLowerCase().includes(lowerQuery) ||
        lot.campus.toLowerCase().includes(lowerQuery) ||
        lot.shortName.toLowerCase().includes(lowerQuery),
    ).map((lot) => ({
      id: lot.id,
      name: lot.name,
      address: `${lot.campus} Campus`,
      latitude: lot.latitude,
      longitude: lot.longitude,
      type: "lot" as const,
      data: lot,
    }));

    const buildingResults: PlaceResult[] = RUTGERS_BUILDINGS.filter((place) =>
      place.name.toLowerCase().includes(lowerQuery),
    ).map((place, index) => ({
      id: `building-${index}`,
      name: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      type: "place" as const,
    }));

    const locationResults: PlaceResult[] = (locationsData as LocationEntry[])
      .filter(
        (loc) =>
          loc.name.toLowerCase().includes(lowerQuery) ||
          loc.aliases?.toLowerCase().includes(lowerQuery),
      )
      .map((loc) => ({
        id: `loc-${loc.id}`,
        name: loc.name,
        address: loc.address,
        type: "place" as const,
      }));

    const combinedPlaces = [...buildingResults, ...locationResults];
    const uniquePlaces = Array.from(
      new Map(combinedPlaces.map((item) => [item.name, item])).values(),
    );

    setResults([...lotResults, ...uniquePlaces].slice(0, 50));
    setSearching(false);
  }, [query]);

  const resolveCoordinates = async (
    item: PlaceResult,
  ): Promise<{ lat: number; lng: number } | null> => {
    if (item.latitude && item.longitude) {
      return { lat: item.latitude, lng: item.longitude };
    }
    setSearching(true);
    try {
      const searchTerm = item.address ?? `${item.name} New Brunswick, NJ`;
      const geocodeResults = await Location.geocodeAsync(searchTerm);
      if (geocodeResults.length > 0) {
        return {
          lat: geocodeResults[0].latitude,
          lng: geocodeResults[0].longitude,
        };
      }
    } catch {
      // ignore geocoding errors
    } finally {
      setSearching(false);
    }
    return null;
  };

  const handleSelect = async (item: PlaceResult) => {
    Keyboard.dismiss();
    if (item.type === "lot") {
      router.push({
        pathname: "/(tabs)" as any,
        params: { selectedLotId: item.id },
      });
      return;
    }

    const coords = await resolveCoordinates(item);
    if (coords) {
      router.push({
        pathname: "/(tabs)" as any,
        params: {
          placeLat: coords.lat,
          placeLng: coords.lng,
          placeName: item.name,
        },
      });
    } else {
      Alert.alert(
        "Location Not Found",
        "Could not determine the coordinates for this location.",
      );
    }
  };

  const lotResults = results.filter((r) => r.type === "lot");
  const placeResults = results.filter((r) => r.type === "place");

  const renderDefaultContent = () => (
    <FlatList
      data={[]}
      keyExtractor={() => ""}
      renderItem={null}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.emptyBody}
      ListHeaderComponent={
        <>
          <Text style={styles.sectionLabel}>POPULAR LOTS</Text>
          {STATIC_LOTS.slice(0, 6).map((lot) => (
            <TouchableOpacity
              key={lot.id}
              onPress={() =>
                handleSelect({
                  id: lot.id,
                  name: lot.name,
                  latitude: lot.latitude,
                  longitude: lot.longitude,
                  type: "lot",
                  address: `${lot.campus} Campus`,
                  data: lot,
                })
              }
              activeOpacity={0.75}
            >
              <GlassCard
                style={styles.popularCard}
                contentStyle={styles.popularCardContent}
                blurIntensity={GLASS.blurMedium}
                borderColor={FLAT_CARD_BORDER}
              >
                <View style={styles.popularIcon}>
                  <IconSymbol
                    name="car.fill"
                    size={15}
                    color={GLASS.iconColor}
                  />
                </View>
                <View style={styles.popularText}>
                  <Text style={styles.popularName}>{lot.name}</Text>
                  <Text style={styles.popularSub}>
                    {lot.campus} · {lot.capacity} spots
                  </Text>
                </View>
                <OccupancyPill rate={lot.occupancyRate} />
              </GlassCard>
            </TouchableOpacity>
          ))}
        </>
      }
    />
  );

  const renderNoResults = () => (
    <View style={styles.noResultsWrap}>
      <IconSymbol name="magnifyingglass" size={40} color="#27272a" />
      <Text style={styles.noResultsTitle}>No results</Text>
      <Text style={styles.noResultsSub}>
        Try a lot name, campus, or building
      </Text>
    </View>
  );

  const renderResultItem = ({
    item,
    index,
  }: {
    item: PlaceResult;
    index: number;
  }) => {
    const prevItem = results[index - 1];
    const showLotHeader =
      item.type === "lot" && (index === 0 || prevItem?.type !== "lot");
    const showPlaceHeader =
      item.type === "place" && (index === 0 || prevItem?.type !== "place");
    const iconName = item.type === "lot" ? "car.fill" : "mappin.and.ellipse";
    const iconColor = item.type === "lot" ? GLASS.iconColor : "#3b82f6";
    return (
      <>
        {showLotHeader && lotResults.length > 0 && (
          <Text style={styles.sectionLabel}>PARKING LOTS</Text>
        )}
        {showPlaceHeader && placeResults.length > 0 && (
          <Text
            style={[
              styles.sectionLabel,
              lotResults.length > 0 && { marginTop: 24 },
            ]}
          >
            PLACES
          </Text>
        )}
        <TouchableOpacity
          onPress={() => handleSelect(item)}
          activeOpacity={0.75}
        >
          <GlassCard
            style={styles.resultCard}
            contentStyle={styles.resultCardContent}
            blurIntensity={GLASS.blurMedium}
            borderColor={FLAT_CARD_BORDER}
          >
            <View
              style={[
                styles.resultIcon,
                item.type === "place" && styles.resultIconPlace,
              ]}
            >
              <IconSymbol name={iconName} size={18} color={iconColor} />
            </View>
            <View style={styles.resultText}>
              <Text style={styles.resultName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.resultAddr} numberOfLines={1}>
                {item.address ?? "Unknown Location"}
              </Text>
            </View>
            {item.type === "lot" && item.data && (
              <OccupancyPill rate={item.data.occupancyRate} />
            )}
            {item.type === "place" && (
              <IconSymbol
                name="chevron.right"
                size={14}
                color={GLASS.textDim}
              />
            )}
          </GlassCard>
        </TouchableOpacity>
      </>
    );
  };

  const renderResultsList = () => (
    <FlatList
      data={results}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.resultsList}
      renderItem={renderResultItem}
    />
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ScarletSpotsBackground />

        {/* ── Main content (rendered before the glass header so blur works) ── */}
        {query.length === 0 && renderDefaultContent()}
        {query.length > 0 &&
          results.length === 0 &&
          !searching &&
          renderNoResults()}
        {query.length > 0 &&
          (results.length > 0 || searching) &&
          renderResultsList()}

        {/* ── Glass header (rendered AFTER content so blur updates correctly) ── */}
        <View style={styles.headerContainer} pointerEvents="box-none">
          <LinearGradient
            colors={[
              "rgba(10,10,12,0.97)",
              "rgba(10,10,12,0.82)",
              "transparent",
            ]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.headerInner} pointerEvents="box-none">
            <Text style={styles.title} pointerEvents="none">
              Search
            </Text>
            <GlassSearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Lots, buildings, addresses…"
              loading={searching}
              style={styles.searchBar}
            />
          </View>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

/** Small reusable occupancy badge */
function OccupancyPill({ rate }: Readonly<{ rate: number }>) {
  const color = getOccupancyColor(rate);
  return (
    <View style={[occupancyStyles.pill, { borderColor: color + "40" }]}>
      <View style={[occupancyStyles.dot, { backgroundColor: color }]} />
      <Text style={[occupancyStyles.text, { color }]}>{Math.round(rate)}%</Text>
    </View>
  );
}

const occupancyStyles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: "700" },
});

const HEADER_HEIGHT = Platform.OS === "ios" ? 152 : 140;

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Glass header overlay
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
    zIndex: 10,
  },
  headerInner: {
    paddingTop: Platform.OS === "ios" ? 60 : 44,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    color: GLASS.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  searchBar: {
    borderRadius: 999,
  },

  // List containers
  emptyBody: {
    paddingTop: HEADER_HEIGHT + 24,
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  resultsList: {
    paddingTop: HEADER_HEIGHT + 16,
    paddingHorizontal: 20,
    paddingBottom: 120,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: GLASS.textMuted,
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },

  // Popular lots
  popularCard: {
    marginBottom: 10,
  },
  popularCardContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 14,
  },
  popularIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  popularText: { flex: 1 },
  popularName: {
    color: "#f0f0f2",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  popularSub: {
    color: GLASS.textMuted,
    fontSize: 12,
    marginTop: 3,
  },

  // Result cards
  resultCard: {
    marginBottom: 8,
  },
  resultCardContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 12,
  },
  resultIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  resultIconPlace: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  resultText: { flex: 1 },
  resultName: {
    color: "#f4f4f5",
    fontSize: 15,
    fontWeight: "600",
  },
  resultAddr: {
    color: GLASS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },

  // Empty state
  noResultsWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -80,
    gap: 10,
  },
  noResultsTitle: {
    color: GLASS.textMuted,
    fontSize: 17,
    fontWeight: "600",
  },
  noResultsSub: {
    color: GLASS.textDim,
    fontSize: 13,
  },
});
