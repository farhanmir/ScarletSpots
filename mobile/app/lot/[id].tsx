import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Linking,
  Alert,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";

import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import {
  useGlassTheme,
  GLASS_DARK,
  type GlassThemePalette,
} from "@/shared/components/ui/glassTheme";
import { useAuth } from "@/providers/AuthProvider";
import { useTabBar } from "@/providers/TabBarProvider";
import { authApiCall, publicApiCall } from "@/shared/api/supabase";
import {
  getLotById,
  getPermitLotIdsUnion,
  ALL_COMMUTER_LOT_IDS,
  getLotScheduleInfo,
  isLotAvailableNow,
  isSecondaryPermitAvailableNow,
  applyOccupancy,
  getAllLots,
  RutgersLot,
} from "@/shared/constants/lots";
import { getOccupancyColor } from "@/features/home/services/utils";
import ForecastChart from "@/features/home/components/lots/ForecastChart";
import { ForecastResponse, ForecastPoint } from "@/features/home/types/types";
import { ENABLE_ALL_CAMPUSES } from "@/shared/constants/featureFlags";
import {
  cacheSession,
  fetchWithOfflineFallback,
  cacheFavorites,
  getCachedFavorites,
} from "@/shared/services/OfflineCache";
import { queueParkAction } from "@/shared/services/OfflineQueue";

export default function LotDetailsScreen() {
  const theme = useGlassTheme();
  const isDark = theme === GLASS_DARK;
  const lotStyles = useMemo(() => createLotStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user, permitType, secondaryPermitType } = useAuth();
  const currentUserId = user?.id ?? null;
  const { setIsTabBarHidden } = useTabBar();

  // ── 67 wobble (one-shot on open) ─────────────────────────────────────────
  const wobble = useSharedValue(0);
  const didWobbleForLotIdRef = useRef<string | null>(null);

  const wobbleStyle = useAnimatedStyle(() => ({
    transform: [
      // Rotation produces opposite motion on left vs right edges.
      { rotateZ: `${-wobble.value * 5}deg` },
      // Small bounce so it feels punchy.
      { translateY: Math.abs(wobble.value) * 2 },
    ],
  }));

  useFocusEffect(
    useCallback(() => {
      setIsTabBarHidden(true);
      return () => setIsTabBarHidden(false);
    }, [setIsTabBarHidden]),
  );

  const lotBase = useMemo(() => (id ? getLotById(id) : null), [id]);

  // live occupancy data (copied logic from HomeScreen)
  const { data: lotsOccupancy } = useQuery<RutgersLot[]>({
    queryKey: ["lots_occupancy"],
    queryFn: async () => {
      const data = await publicApiCall("/lots/occupancy");
      const rows = Array.isArray(data?.occupancy) ? data.occupancy : [];
      const occupancyMap: Record<string, number> = {};
      for (const row of rows) {
        occupancyMap[row.lot_id] = row.count ?? 0;
      }
      return applyOccupancy(getAllLots(ENABLE_ALL_CAMPUSES), occupancyMap);
    },
    staleTime: 1000 * 60 * 2,
  });

  const lot = useMemo(() => {
    if (!lotBase) return null;
    const live = lotsOccupancy?.find((l) => l.id === id);
    return live ? { ...lotBase, ...live } : lotBase;
  }, [lotBase, lotsOccupancy, id]);

  useEffect(() => {
    if (!lot?.id || !lot?.shortName?.includes("67")) return;
    if (didWobbleForLotIdRef.current === lot.id) return;
    didWobbleForLotIdRef.current = lot.id;

    // Action-like wobble: right up / left down, then reverse (one-shot).
    wobble.value = withSequence(
      withTiming(1, { duration: 120, easing: Easing.linear }),
      withTiming(-1, { duration: 180, easing: Easing.linear }),
      withTiming(0.7, { duration: 110, easing: Easing.linear }),
      withTiming(-0.7, { duration: 160, easing: Easing.linear }),
      withTiming(0.4, { duration: 100, easing: Easing.linear }),
      withTiming(-0.4, { duration: 140, easing: Easing.linear }),
      withTiming(0, { duration: 120, easing: Easing.linear }),
    );
  }, [lot?.id, lot?.shortName, wobble]);

  // Favorites
  const { data: favorites = [] } = useQuery<string[]>({
    queryKey: ["favorites"],
    queryFn: async () => {
      if (!user) return [];
      try {
        const { data } = await fetchWithOfflineFallback(
          async () => {
            const resp = await authApiCall("/favorites");
            const ids = (resp?.favorite_lots ?? []).map((l: any) =>
              String(l.lot_id ?? l.id),
            );
            await cacheFavorites(ids, currentUserId);
            return ids;
          },
          "favorites_cache",
          1000 * 60 * 5,
          currentUserId,
        );
        return data;
      } catch {
        return (await getCachedFavorites(currentUserId)) || [];
      }
    },
    enabled: !!user,
  });

  const isFavorite = useMemo(
    () => lot && favorites.includes(lot.id),
    [lot, favorites],
  );

  // Forecast
  const { data: forecastData, isLoading: isLoadingForecast } =
    useQuery<ForecastResponse>({
      queryKey: ["forecast", id, lot?.capacity],
      queryFn: async () => {
        const data = await publicApiCall(
          `/lots/${id}/forecast?capacity=${lot?.capacity}&current_occupancy=${lot?.occupiedCount}`,
        );
        return data || {};
      },
      enabled:
        !!id && !!lot && !id.startsWith("custom:") && (lot.capacity ?? 0) > 0,
      staleTime: 60000 * 15,
    });

  const forecast: ForecastPoint[] = useMemo(() => {
    if (!forecastData) return [];
    if (forecastData.curve && Array.isArray(forecastData.curve))
      return forecastData.curve;
    if (Array.isArray(forecastData))
      return forecastData as unknown as ForecastPoint[];
    return [];
  }, [forecastData]);

  // Session
  const { data: sessionData } = useQuery({
    queryKey: ["session", "active"],
    queryFn: async () => {
      const result = await fetchWithOfflineFallback(
        async () => {
          const data = await authApiCall("/park/session/active");
          return data;
        },
        "offline_cache_session",
        1000 * 60 * 1,
        currentUserId,
      );
      return result.data ?? { session: null };
    },
    enabled: !!user,
  });

  const activeSession = sessionData?.session ?? null;

  // Handlers
  const toggleFavorite = async () => {
    if (!user || !lot) return;
    const wasFavorite = isFavorite;
    const newFavorites = wasFavorite
      ? favorites.filter((fid) => fid !== lot.id)
      : [...favorites, lot.id];

    queryClient.setQueryData(["favorites"], newFavorites);
    cacheFavorites(newFavorites, currentUserId);

    try {
      if (wasFavorite) {
        await authApiCall(`/favorites/${lot.id}`, { method: "DELETE" });
      } else {
        await authApiCall(`/favorites/${lot.id}`, { method: "POST" });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      queryClient.setQueryData(["favorites"], favorites);
      cacheFavorites(favorites, currentUserId);
      Alert.alert("Error", "Failed to update favorites");
    }
  };

  const updateOptimisticOccupancy = useCallback(
    (lotId: string, delta: number) => {
      queryClient.setQueryData(
        ["lots_occupancy"],
        (old: RutgersLot[] | undefined) => {
          if (!old) return old;
          return old.map((l) => {
            if (l.id !== lotId) return l;
            const newOcc = Math.max(0, (l.occupiedCount ?? 0) + delta);
            return {
              ...l,
              occupiedCount: newOcc,
              occupancyRate:
                l.capacity > 0 ? Math.min(100, (newOcc / l.capacity) * 100) : 0,
            };
          });
        },
      );
    },
    [queryClient],
  );

  const handlePark = async () => {
    if (!user || !lot) return;

    // Get location?
    // For now we'll just try to park without precise coords if not available,
    // though HomeScreen passes location.

    try {
      const payload = {
        lotId: lot.id,
        confirmed: true,
      };

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await queueParkAction("PARK", payload, undefined, undefined, currentUserId);
        const optimisticSession = {
          id: `offline-${Date.now()}`,
          lotId: lot.id,
          startTime: new Date().toISOString(),
        };
        queryClient.setQueryData(["session", "active"], {
          session: optimisticSession,
        });
        cacheSession({ session: optimisticSession }, currentUserId).catch(() => {});
        updateOptimisticOccupancy(lot.id, 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.dismiss();
        Alert.alert("Parked Offline", `Session queued.`);
        return;
      }

      const data = await authApiCall("/park/session", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (data?.success) {
        const session = data.session ?? {
          id: `offline-${Date.now()}`,
          lotId: lot.id,
          startTime: new Date().toISOString(),
        };
        queryClient.setQueryData(["session", "active"], { session });
        cacheSession({ session }, currentUserId).catch(() => {});
        updateOptimisticOccupancy(lot.id, 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.dismiss();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to start parking session");
    }
  };

  const openDirections = () => {
    if (!lot) return;
    const mapsScheme = Platform.select({
      ios: "maps:0,0?q=",
      android: "geo:0,0?q=",
    });
    const latLng = `${lot.latitude},${lot.longitude}`;
    const url = Platform.select({
      ios: `${mapsScheme}${lot.name}@${latLng}`,
      android: `${mapsScheme}${latLng}(${lot.name})`,
    });
    if (url) Linking.openURL(url);
  };

  if (!lot) return null;

  const greenOk = isDark ? "#4ade80" : "#16a34a";
  const redAlert = isDark ? "#ef4444" : "#b91c1c";

  const permitValidity = permitType
    ? permitType === "__commuter_all"
      ? ALL_COMMUTER_LOT_IDS.has(lot.id)
      : getPermitLotIdsUnion(permitType, secondaryPermitType).has(lot.id)
    : null;
  const scheduleInfo = getLotScheduleInfo(permitType, lot.id);
  const lotAvailable =
    isLotAvailableNow(permitType, lot.id) ||
    isSecondaryPermitAvailableNow(secondaryPermitType, lot.id);
  const occColor = getOccupancyColor(lot.occupancyRate);

  const features = [
    lot.student && {
      icon: "graduationcap.fill",
      label: "Student",
      color: isDark ? "#818cf8" : "#4f46e5",
      bg: isDark ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.10)",
      border: isDark ? "rgba(99,102,241,0.35)" : "rgba(99,102,241,0.30)",
    },
    lot.employee && {
      icon: "briefcase.fill",
      label: "Employee",
      color: isDark ? "#34d399" : "#059669",
      bg: isDark ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.10)",
      border: isDark ? "rgba(16,185,129,0.3)" : "rgba(16,185,129,0.30)",
    },
    (lot.regularGate || lot.smartGate) && {
      icon: "lock.fill",
      label: "Gated",
      color: isDark ? "#fbbf24" : "#d97706",
      bg: isDark ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.10)",
      border: isDark ? "rgba(245,158,11,0.3)" : "rgba(245,158,11,0.30)",
    },
    lot.evCharging > 0 && {
      icon: "bolt.car.fill",
      label: "EV Charging",
      color: isDark ? "#60a5fa" : "#2563eb",
      bg: isDark ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.10)",
      border: isDark ? "rgba(59,130,246,0.3)" : "rgba(59,130,246,0.30)",
    },
    lot.handicapped > 0 && {
      icon: "figure.roll",
      label: "Accessible",
      color: isDark ? "#c084fc" : "#7c3aed",
      bg: isDark ? "rgba(168,85,247,0.12)" : "rgba(168,85,247,0.10)",
      border: isDark ? "rgba(168,85,247,0.3)" : "rgba(168,85,247,0.30)",
    },
  ].filter(Boolean) as any[];

  return (
    <Animated.View style={[lotStyles.outerContainer, wobbleStyle]}>
      <ScrollView
        style={lotStyles.scroll}
        contentContainerStyle={lotStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={lotStyles.headerRow}>
          <View style={lotStyles.headerLeft}>
            {lot.campus ? (
              <View style={lotStyles.campusPill}>
                <Text style={lotStyles.campusPillText}>{lot.campus} Campus</Text>
              </View>
            ) : null}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text style={lotStyles.lotName}>{lot.name}</Text>
              {permitValidity !== null && (
                <View
                  style={[
                    lotStyles.permitBadge,
                    {
                      backgroundColor: permitValidity
                        ? "rgba(34,197,94,0.12)"
                        : "rgba(113,113,122,0.08)",
                      borderColor: permitValidity
                        ? "rgba(34,197,94,0.3)"
                        : "rgba(113,113,122,0.15)",
                    },
                  ]}
                >
                  <IconSymbol
                    name={permitValidity ? "checkmark" : "xmark"}
                    size={10}
                    color={permitValidity ? greenOk : theme.textMuted}
                  />
                </View>
              )}
            </View>
          </View>
          <View style={lotStyles.headerRight}>
            {user && (
              <TouchableOpacity onPress={toggleFavorite} style={lotStyles.iconBtn}>
                <IconSymbol
                  name={isFavorite ? "star.fill" : "star"}
                  size={20}
                  color={isFavorite ? "#f59e0b" : theme.textMuted}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => router.dismiss()}
              style={lotStyles.iconBtn}
            >
              <IconSymbol name="xmark" size={14} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={lotStyles.statsRow}>
          <View style={lotStyles.statCard}>
            <Text style={[lotStyles.statVal, { color: occColor }]}>
              {Math.round(lot.occupancyRate)}%
            </Text>
            <Text style={lotStyles.statLab}>Full</Text>
          </View>
          <View style={lotStyles.statCard}>
            <Text style={lotStyles.statVal}>{lot.occupiedCount}</Text>
            <Text style={lotStyles.statLab}>Sessions</Text>
          </View>
          <View style={lotStyles.statCard}>
            <Text style={lotStyles.statVal}>{lot.capacity}</Text>
            <Text style={lotStyles.statLab}>Capacity</Text>
          </View>
        </View>

        <View style={lotStyles.barTrack}>
          <View
            style={[
              lotStyles.barFill,
              {
                width: `${Math.min(100, lot.occupancyRate)}%` as any,
                backgroundColor: occColor,
              },
            ]}
          />
        </View>

        {features.length > 0 && (
          <View style={lotStyles.featureRow}>
            {features.map((f) => (
              <View
                key={f.label}
                style={[
                  lotStyles.featurePill,
                  { backgroundColor: f.bg, borderColor: f.border },
                ]}
              >
                <IconSymbol name={f.icon as any} size={11} color={f.color} />
                <Text style={[lotStyles.featurePillText, { color: f.color }]}>
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {scheduleInfo && (
          <View style={lotStyles.scheduleSection}>
            <View style={lotStyles.scheduleHeader}>
              <IconSymbol name="clock.fill" size={13} color={theme.textMuted} />
              <Text style={lotStyles.scheduleTitle}>SCHEDULE</Text>
              {lotAvailable !== null && (
                <View
                  style={[
                    lotStyles.availBadge,
                    lotAvailable
                      ? lotStyles.availBadgeOpen
                      : lotStyles.availBadgeClosed,
                  ]}
                >
                  <View
                    style={[
                      lotStyles.availDot,
                      { backgroundColor: lotAvailable ? greenOk : redAlert },
                    ]}
                  />
                  <Text
                    style={[
                      lotStyles.availText,
                      { color: lotAvailable ? greenOk : redAlert },
                    ]}
                  >
                    {lotAvailable ? "OPEN" : "CLOSED"}
                  </Text>
                </View>
              )}
            </View>
            {scheduleInfo.time_text_1 ? (
              <Text style={lotStyles.scheduleText}>
                {scheduleInfo.time_text_1}
              </Text>
            ) : null}
            {scheduleInfo.time_text_2 ? (
              <Text style={lotStyles.scheduleText}>
                {scheduleInfo.time_text_2}
              </Text>
            ) : null}
          </View>
        )}

        {lot.note ? (
          <View style={lotStyles.notesSection}>
            <View style={lotStyles.notesHeader}>
              <IconSymbol name="info.circle.fill" size={13} color={theme.textMuted} />
              <Text style={lotStyles.notesTitle}>NOTES</Text>
            </View>
            <Text style={lotStyles.notesText}>{lot.note}</Text>
          </View>
        ) : null}

        <ForecastChart curve={forecast} isLoading={isLoadingForecast} />

        <View style={lotStyles.actionsRow}>
          {!activeSession && (
            <TouchableOpacity
              style={[
                lotStyles.parkBtn,
                (!user || lot.occupancyRate >= 100) && lotStyles.parkBtnDisabled,
              ]}
              onPress={() => {
                if (user && lot.occupancyRate < 100) {
                  Alert.alert(
                    "Confirm Parking",
                    `Start a session at ${lot.name}?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Park Here", onPress: handlePark },
                    ],
                  );
                }
              }}
              activeOpacity={0.8}
            >
              <IconSymbol name="p.circle.fill" size={20} color="#fff" />
              <Text style={lotStyles.parkBtnText}>
                {!user
                  ? "Sign in to Park"
                  : activeSession
                    ? "Parked Here"
                    : lot.occupancyRate >= 100
                      ? "Lot Full"
                      : "Park Here"}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              lotStyles.dirBtn,
              !activeSession && { flex: 0, paddingHorizontal: 20 },
            ]}
            onPress={openDirections}
            activeOpacity={0.8}
          >
            <IconSymbol
              name="arrow.triangle.turn.up.right.diamond.fill"
              size={18}
              color={isDark ? "#60a5fa" : "#2563eb"}
            />
            {!!activeSession && (
              <Text style={lotStyles.dirBtnText}>Directions</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </Animated.View>
  );
}

function createLotStyles(theme: GlassThemePalette, isDark: boolean) {
  return StyleSheet.create({
    outerContainer: {
      flex: 1,
      backgroundColor: isDark ? "#111317" : "#f5f5f7",
    },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingTop: 30 },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 20,
      gap: 12,
    },
    headerLeft: { flex: 1, gap: 6 },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingTop: 2,
    },
    campusPill: {
      alignSelf: "flex-start",
      backgroundColor: isDark ? "rgba(220,38,38,0.12)" : "rgba(204,0,51,0.08)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(220,38,38,0.25)" : "rgba(204,0,51,0.20)",
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 8,
    },
    campusPillText: {
      color: isDark ? "#f87171" : "#cc0033",
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    lotName: {
      fontSize: 24,
      fontWeight: "700",
      color: theme.textPrimary,
      letterSpacing: -0.3,
      lineHeight: 30,
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
      justifyContent: "center",
      alignItems: "center",
    },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    statCard: {
      flex: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
      gap: 4,
    },
    statVal: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.textPrimary,
      fontVariant: ["tabular-nums"],
    },
    statLab: { fontSize: 12, color: theme.textMuted, fontWeight: "500" },
    barTrack: {
      height: 4,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
      borderRadius: 2,
      marginBottom: 20,
      overflow: "hidden",
    },
    barFill: { height: 4, borderRadius: 2 },
    featureRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    featurePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
    },
    featurePillText: { fontSize: 12, fontWeight: "700" },
    permitBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    scheduleSection: {
      marginBottom: 16,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
    },
    scheduleHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    scheduleTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      flex: 1,
    },
    availBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
    },
    availBadgeOpen: {
      backgroundColor: "rgba(34,197,94,0.08)",
      borderColor: "rgba(34,197,94,0.25)",
    },
    availBadgeClosed: {
      backgroundColor: "rgba(239,68,68,0.08)",
      borderColor: "rgba(239,68,68,0.25)",
    },
    availDot: { width: 5, height: 5, borderRadius: 2.5 },
    availText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
    scheduleText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: "500",
      lineHeight: 20,
    },
    notesSection: {
      marginBottom: 16,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
    },
    notesHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    notesTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
    },
    notesText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: "500",
      lineHeight: 20,
    },
    actionsRow: { flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 12 },
    parkBtn: {
      flex: 1,
      height: 54,
      borderRadius: 17,
      backgroundColor: isDark ? "#dc2626" : "#cc0033",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    parkBtnDisabled: {
      backgroundColor: isDark ? "#3f3f46" : "#d4d4d8",
      opacity: 0.6,
    },
    parkBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    dirBtn: {
      height: 54,
      borderRadius: 17,
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      flex: 1,
    },
    dirBtnText: { color: theme.textPrimary, fontSize: 16, fontWeight: "600" },
  });
}
