import React, { useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Linking,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import { authApiCall } from "@/shared/api/supabase";
import {
  useGlassTheme,
  GLASS_DARK,
  type GlassThemePalette,
} from "@/shared/components/ui/glassTheme";
import {
  type RutgersLot,
  getPermitLotIdsUnion,
  ALL_COMMUTER_LOT_IDS,
  getLotScheduleInfo,
  isLotAvailableNow,
  isSecondaryPermitAvailableNow,
} from "@/shared/constants/lots";
import { ForecastResponse, ForecastPoint } from "@/features/home/types/types";
import ForecastChart from "./lots/ForecastChart";

// Returns a single hex colour string (not an object like HomeScreen's helper).
const occColor = (rate: number) => {
  if (rate >= 90) return "#ef4444";
  if (rate >= 70) return "#f59e0b";
  return "#10b981";
};

export interface LotDetailsSheetContentProps {
  lot: RutgersLot;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onPark: (lotId: string) => void;
  loading: boolean;
  user: any;
  activeSession?: any;
  permitType?: string | null;
  secondaryPermitType?: string | null;
}

export default function LotDetailsSheetContent({
  lot,
  isFavorite,
  onToggleFavorite,
  onPark,
  loading,
  user,
  activeSession,
  permitType,
  secondaryPermitType,
}: LotDetailsSheetContentProps) {
  const theme = useGlassTheme();
  const isDark = theme === GLASS_DARK;
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  // ── 67 wobble (one-shot per sheet open) ────────────────────────────────
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

  // ── Forecast ────────────────────────────────────────────────────────────
  const { data: forecastData, isLoading: isLoadingForecast } =
    useQuery<ForecastResponse>({
      queryKey: ["forecast", lot.id, lot.capacity],
      queryFn: async () => {
        const data = await authApiCall(
          `/lots/${lot.id}/forecast?capacity=${lot.capacity}&current_occupancy=${lot.occupiedCount}`,
        );
        return data || {};
      },
      enabled:
        !!lot.id && !lot.id.startsWith("custom:") && (lot.capacity ?? 0) > 0,
      staleTime: 60000 * 15,
      retry: 1,
    });

  const forecast: ForecastPoint[] = useMemo(() => {
    if (!forecastData) return [];
    if (forecastData.curve && Array.isArray(forecastData.curve))
      return forecastData.curve;
    if (Array.isArray(forecastData))
      return forecastData as unknown as ForecastPoint[];
    return [];
  }, [forecastData]);

  // ── Permit validity ─────────────────────────────────────────────────────
  const permitValidity: boolean | null = useMemo(() => {
    if (!permitType) return null;
    if (permitType === "__commuter_all")
      return ALL_COMMUTER_LOT_IDS.has(lot.id);
    if (permitType.startsWith("__custom:")) {
      const flags = permitType.slice("__custom:".length).split(",");
      return flags.some((flag) => {
        if (flag === "student") return lot.student;
        if (flag === "employee") return lot.employee;
        if (flag === "gated") return lot.regularGate || lot.smartGate;
        if (flag === "ev") return (lot.evCharging ?? 0) > 0;
        return false;
      });
    }
    return getPermitLotIdsUnion(permitType, secondaryPermitType).has(lot.id);
  }, [permitType, secondaryPermitType, lot]);

  const scheduleInfo = useMemo(
    () => getLotScheduleInfo(permitType, lot.id),
    [permitType, lot.id],
  );

  const lotAvailable = useMemo(
    () =>
      isLotAvailableNow(permitType, lot.id) ||
      isSecondaryPermitAvailableNow(secondaryPermitType, lot.id),
    [permitType, secondaryPermitType, lot.id],
  );

  // ── Feature pills ────────────────────────────────────────────────────────
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
    (lot.evCharging ?? 0) > 0 && {
      icon: "bolt.car.fill",
      label: "EV Charging",
      color: isDark ? "#60a5fa" : "#2563eb",
      bg: isDark ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.10)",
      border: isDark ? "rgba(59,130,246,0.3)" : "rgba(59,130,246,0.30)",
    },
    (lot.handicapped ?? 0) > 0 && {
      icon: "figure.roll",
      label: "Accessible",
      color: isDark ? "#c084fc" : "#7c3aed",
      bg: isDark ? "rgba(168,85,247,0.12)" : "rgba(168,85,247,0.10)",
      border: isDark ? "rgba(168,85,247,0.3)" : "rgba(168,85,247,0.30)",
    },
  ].filter(Boolean) as {
    icon: string;
    label: string;
    color: string;
    bg: string;
    border: string;
  }[];

  // ── Derived stats ────────────────────────────────────────────────────────
  const rate = Math.round(lot.occupancyRate ?? 0);
  const valueColor = occColor(lot.occupancyRate ?? 0);
  const isParked = activeSession?.lotId === lot.id;
  const parkDisabled = !user || lot.occupancyRate >= 100 || !!activeSession;

  const getParkLabel = () => {
    if (!user) return "Sign in to Park";
    if (isParked) return "Parked Here";
    if (activeSession) return "End Session First";
    if (lot.occupancyRate >= 100) return "Lot Full";
    if (loading) return "Confirming…";
    return "Park Here";
  };

  const openDirections = () => {
    const scheme = Platform.select({
      ios: "maps:0,0?q=",
      android: "geo:0,0?q=",
    });
    const latLng = `${lot.latitude},${lot.longitude}`;
    const url = Platform.select({
      ios: `${scheme}${lot.name}@${latLng}`,
      android: `${scheme}${latLng}(${lot.name})`,
    });
    if (url) Linking.openURL(url);
  };

  return (
    <Animated.View style={wobbleStyle}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {/* Campus pill */}
            {lot.campus ? (
              <View style={styles.campusPill}>
                <Text style={styles.campusPillText}>{lot.campus} Campus</Text>
              </View>
            ) : null}

            {/* Lot name + permit badge */}
            <View style={styles.nameRow}>
              <Text style={styles.lotName} numberOfLines={1}>
                {lot.name}
              </Text>
              {permitValidity === true && (
                <IconSymbol
                  name="checkmark.circle.fill"
                  size={20}
                  color={isDark ? "#4ade80" : "#16a34a"}
                />
              )}
            </View>
          </View>

          {/* Favorite button */}
          <View style={styles.headerButtons}>
            <View style={styles.iconBtnSpacer} />
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={onToggleFavorite}
              activeOpacity={0.75}
            >
              <IconSymbol
                name={isFavorite ? "star.fill" : "star"}
                size={18}
                color={isFavorite ? "#f59e0b" : theme.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Stats (exactly 3) ───────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { color: valueColor }]}>{rate}%</Text>
            <Text style={styles.statLab}>Full</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{lot.occupiedCount ?? 0}</Text>
            <Text style={styles.statLab}>Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{lot.capacity ?? 0}</Text>
            <Text style={styles.statLab}>Capacity</Text>
          </View>
        </View>

        {/* ── Feature pills ───────────────────────────────────────────────── */}
        {features.length > 0 && (
          <View style={styles.featureRow}>
            {features.map((f) => (
              <View
                key={f.label}
                style={[
                  styles.featurePill,
                  { backgroundColor: f.bg, borderColor: f.border },
                ]}
              >
                <IconSymbol name={f.icon as any} size={12} color={f.color} />
                <Text style={[styles.featurePillText, { color: f.color }]}>
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Schedule card ───────────────────────────────────────────────── */}
        {scheduleInfo && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <IconSymbol name="clock.fill" size={13} color={theme.textMuted} />
              <Text style={styles.cardTitle}>SCHEDULE</Text>
              <View
                style={[
                  styles.availBadge,
                  lotAvailable ? styles.availOpen : styles.availClosed,
                ]}
              >
                <View
                  style={[
                    styles.availDot,
                    { backgroundColor: lotAvailable ? (isDark ? "#4ade80" : "#16a34a") : (isDark ? "#ef4444" : "#b91c1c") },
                  ]}
                />
                <Text
                  style={[
                    styles.availText,
                    { color: lotAvailable ? (isDark ? "#4ade80" : "#16a34a") : (isDark ? "#ef4444" : "#b91c1c") },
                  ]}
                >
                  {lotAvailable ? "OPEN" : "CLOSED"}
                </Text>
              </View>
            </View>
            {scheduleInfo.time_text_1 ? (
              <Text style={styles.cardBody}>{scheduleInfo.time_text_1}</Text>
            ) : null}
            {scheduleInfo.time_text_2 ? (
              <Text style={styles.cardBody}>{scheduleInfo.time_text_2}</Text>
            ) : null}
          </View>
        )}

        {/* ── Notes card ──────────────────────────────────────────────────── */}
        {lot.note ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <IconSymbol name="info.circle.fill" size={13} color={theme.textMuted} />
              <Text style={styles.cardTitle}>NOTES</Text>
            </View>
            <Text style={styles.cardBody}>{lot.note}</Text>
          </View>
        ) : null}

        {/* ── Forecast timeline ───────────────────────────────────────────── */}
        <View style={styles.forecastWrapper}>
          <ForecastChart curve={forecast} isLoading={isLoadingForecast} />
        </View>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <View style={styles.actionsRow}>
          {!isParked && (
            <TouchableOpacity
              style={[
                styles.parkBtn,
                parkDisabled && styles.parkBtnDisabled,
              ]}
              onPress={() => {
                if (!parkDisabled) {
                  Alert.alert(
                    "Confirm Parking",
                    `Start a session at ${lot.name}?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Park Here",
                        style: "default",
                        onPress: () => onPark(lot.id),
                      },
                    ],
                  );
                }
              }}
              disabled={loading || parkDisabled}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <IconSymbol name="p.circle.fill" size={20} color="#fff" />
                  <Text style={styles.parkBtnText}>{getParkLabel()}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.dirBtn, isParked && { flex: 1 }]}
            onPress={openDirections}
            activeOpacity={0.8}
          >
            <IconSymbol
              name="arrow.triangle.turn.up.right.diamond.fill"
              size={18}
              color={isDark ? "#60a5fa" : "#2563eb"}
            />
            {isParked && <Text style={styles.dirBtnText}>Directions</Text>}
          </TouchableOpacity>
        </View>

        {!user && (
          <Text style={styles.signInNote}>
            Sign in from the Profile tab to log parking sessions
          </Text>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </Animated.View>
  );
}

function createStyles(theme: GlassThemePalette, isDark: boolean) {
  return StyleSheet.create({
  scroll: { width: "100%" },
  content: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8 },

  // ── Header ──────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    gap: 10,
  },
  headerLeft: { flex: 1, gap: 6 },
  headerButtons: {
    flexDirection: "row",
    gap: 6,
    paddingTop: 2,
    justifyContent: "flex-end",
  },
  iconBtnSpacer: {
    width: 34,
    height: 34,
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
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "nowrap",
  },
  lotName: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 30,
    flexShrink: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Stats ────────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.04)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    gap: 3,
  },
  statVal: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  statLab: {
    fontSize: 12,
    color: theme.textMuted,
    fontWeight: "500",
  },

  // ── Feature pills ────────────────────────────────────────────────────────
  featureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  featurePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  featurePillText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // ── Cards (Schedule / Notes) ─────────────────────────────────────────────
  card: {
    backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cardBody: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
  },

  // Open / Closed pill inside Schedule card
  availBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  availOpen: {
    backgroundColor: isDark ? "rgba(74,222,128,0.08)" : "rgba(34,197,94,0.08)",
    borderColor: isDark ? "rgba(74,222,128,0.25)" : "rgba(34,197,94,0.25)",
  },
  availClosed: {
    backgroundColor: isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.08)",
    borderColor: isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.25)",
  },
  availDot: { width: 5, height: 5, borderRadius: 3 },
  availText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },

  // ── Action buttons ───────────────────────────────────────────────────────
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    marginBottom: 8,
  },
  parkBtn: {
    flex: 1,
    height: 54,
    borderRadius: 17,
    backgroundColor: isDark ? "#dc2626" : "#cc0033",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  parkBtnDisabled: {
    backgroundColor: isDark ? "#27272a" : "#d4d4d8",
    shadowOpacity: 0,
    elevation: 0,
  },
  parkBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  dirBtn: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: isDark ? "rgba(59,130,246,0.08)" : "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: isDark ? "rgba(59,130,246,0.25)" : "rgba(0,0,0,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dirBtnText: { color: isDark ? "#60a5fa" : "#2563eb", fontWeight: "600", fontSize: 16 },

  signInNote: {
    color: theme.textSecondary,
    textAlign: "center",
    fontSize: 12,
    marginTop: 4,
  },

  // Wrapper for forecast — larger gap from notes, dynamic height for vertical bars
  forecastWrapper: {
    marginTop: 20,
    marginBottom: 8,
    minHeight: 60,
  },
});
}
