import React, { useMemo } from "react";
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
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import { publicApiCall } from "@/shared/api/supabase";
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
  // ── Forecast ────────────────────────────────────────────────────────────
  const { data: forecastData, isLoading: isLoadingForecast } =
    useQuery<ForecastResponse>({
      queryKey: ["forecast", lot.id, lot.capacity],
      queryFn: async () => {
        const data = await publicApiCall(
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
      color: "#818cf8",
      bg: "rgba(99,102,241,0.15)",
      border: "rgba(99,102,241,0.35)",
    },
    lot.employee && {
      icon: "briefcase.fill",
      label: "Employee",
      color: "#34d399",
      bg: "rgba(16,185,129,0.12)",
      border: "rgba(16,185,129,0.3)",
    },
    (lot.regularGate || lot.smartGate) && {
      icon: "lock.fill",
      label: "Gated",
      color: "#fbbf24",
      bg: "rgba(245,158,11,0.12)",
      border: "rgba(245,158,11,0.3)",
    },
    (lot.evCharging ?? 0) > 0 && {
      icon: "bolt.car.fill",
      label: "EV Charging",
      color: "#60a5fa",
      bg: "rgba(59,130,246,0.12)",
      border: "rgba(59,130,246,0.3)",
    },
    (lot.handicapped ?? 0) > 0 && {
      icon: "figure.roll",
      label: "Accessible",
      color: "#c084fc",
      bg: "rgba(168,85,247,0.12)",
      border: "rgba(168,85,247,0.3)",
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
                color="#4ade80"
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
              color={isFavorite ? "#f59e0b" : "#a1a1aa"}
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
            <IconSymbol name="clock.fill" size={13} color="#71717a" />
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
                  { backgroundColor: lotAvailable ? "#4ade80" : "#ef4444" },
                ]}
              />
              <Text
                style={[
                  styles.availText,
                  { color: lotAvailable ? "#4ade80" : "#ef4444" },
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
            <IconSymbol name="info.circle.fill" size={13} color="#71717a" />
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
            style={[styles.parkBtn, parkDisabled && styles.parkBtnDisabled]}
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
            color="#60a5fa"
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
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(220,38,38,0.12)",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.25)",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  campusPillText: {
    color: "#f87171",
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
    color: "#fafafa",
    letterSpacing: -0.3,
    lineHeight: 30,
    flexShrink: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 3,
  },
  statVal: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f4f4f5",
    fontVariant: ["tabular-nums"],
  },
  statLab: {
    fontSize: 12,
    color: "#71717a",
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
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
    color: "#71717a",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cardBody: {
    color: "#a1a1aa",
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
    backgroundColor: "rgba(74,222,128,0.08)",
    borderColor: "rgba(74,222,128,0.25)",
  },
  availClosed: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderColor: "rgba(239,68,68,0.25)",
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
    backgroundColor: "#dc2626",
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
    backgroundColor: "#27272a",
    shadowOpacity: 0,
    elevation: 0,
  },
  parkBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  dirBtn: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: "rgba(59,130,246,0.08)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.25)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dirBtnText: { color: "#60a5fa", fontWeight: "600", fontSize: 16 },

  signInNote: {
    color: "#3f3f46",
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
