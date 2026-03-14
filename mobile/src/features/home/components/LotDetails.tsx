import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Platform,
  Linking,
  TouchableWithoutFeedback,
  Alert,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import { GlassBackground } from "@/shared/components/ui/GlassBackground";
import {
  type RutgersLot,
  getPermitLotIdsUnion,
  ALL_COMMUTER_LOT_IDS,
  getLotScheduleInfo,
  isLotAvailableNow,
  isSecondaryPermitAvailableNow,
} from "@/shared/constants/lots";

import { useQuery } from "@tanstack/react-query";
import { publicApiCall } from "@/shared/api/supabase";
import { ForecastResponse, ForecastPoint } from "@/features/home/types/types";
import { getOccupancyColor } from "@/features/home/services/utils";
import ForecastChart from "./lots/ForecastChart";

const { height: SCREEN_H } = Dimensions.get("window");

// Snap points relative to the top of the screen
const SNAP_HIDDEN = SCREEN_H;
const SNAP_PEEK = SCREEN_H * 0.65;
const SNAP_EXPANDED = Platform.OS === "ios" ? 80 : 60;

type Lot = RutgersLot;

interface LotDetailsProps {
  lot: Lot;
  visible: boolean;
  onClose: () => void;
  onPark: (lotId: string) => void;
  isParking: boolean;
  user: any;
  activeSession?: any;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  permitType?: string | null;
  secondaryPermitType?: string | null;
}

export default function LotDetails({
  lot,
  visible,
  onClose,
  onPark,
  isParking,
  user,
  activeSession,
  isFavorite,
  onToggleFavorite,
  permitType,
  secondaryPermitType,
}: LotDetailsProps) {
  const translateY = useSharedValue(SNAP_HIDDEN);
  const dragStartY = useSharedValue(SNAP_HIDDEN);
  const scrollY = useSharedValue(0);
  const isScrollable = useSharedValue(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    if (visible) {
      translateY.value = withSpring(SNAP_PEEK, { damping: 20, stiffness: 150 });
    } else {
      translateY.value = withTiming(SNAP_HIDDEN, { duration: 250 });
    }
    return () => {
      mountedRef.current = false;
    };
  }, [visible, translateY]);

  const scrollToSnap = useCallback(
    (snapPoint: number) => {
      "worklet";
      translateY.value = withSpring(snapPoint, { damping: 22, stiffness: 180 });
      if (snapPoint === SNAP_HIDDEN) {
        runOnJS(onClose)();
      }
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    },
    [onClose, translateY],
  );

  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      const nextY = dragStartY.value + e.translationY;
      if (nextY >= SNAP_EXPANDED) {
        translateY.value = nextY;
      }
    })
    .onEnd((e) => {
      const velocity = e.velocityY;
      const target = translateY.value + velocity * 0.1;

      // Snapping logic
      if (target > SNAP_PEEK + 100 || (velocity > 500 && target > SNAP_PEEK)) {
        scrollToSnap(SNAP_HIDDEN);
      } else if (target < (SNAP_PEEK + SNAP_EXPANDED) / 2) {
        scrollToSnap(SNAP_EXPANDED);
        isScrollable.value = true;
      } else {
        scrollToSnap(SNAP_PEEK);
        isScrollable.value = false;
      }
    });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
    onBeginDrag: (e) => {
      if (translateY.value > SNAP_EXPANDED + 10) {
        // Prevent scroll if not fully expanded
      }
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [SNAP_HIDDEN, SNAP_PEEK, SNAP_EXPANDED],
      [0, 0.2, 0.4],
      Extrapolation.CLAMP,
    ),
    pointerEvents: translateY.value < SNAP_HIDDEN ? "auto" : "none",
  }));

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
        if (flag === "ev") return lot.evCharging > 0;
        return false;
      });
    }
    return getPermitLotIdsUnion(permitType, secondaryPermitType).has(lot.id);
  }, [permitType, secondaryPermitType, lot]);

  const scheduleInfo = useMemo(() => {
    return getLotScheduleInfo(permitType, lot.id);
  }, [permitType, lot.id]);

  const lotAvailable = useMemo(() => {
    return (
      isLotAvailableNow(permitType, lot.id) ||
      isSecondaryPermitAvailableNow(secondaryPermitType, lot.id)
    );
  }, [permitType, secondaryPermitType, lot.id]);

  const renderActionText = () => {
    if (!user) return "Sign in to Park";
    if (activeSession && activeSession.lotId === lot.id) return "Parked Here";
    if (activeSession) return "End Current Session First";
    if (lot.occupancyRate >= 100) return "Lot Full";
    if (isParking) return "Confirming...";
    return "Park Here";
  };

  const openDirections = () => {
    const scheme = Platform.select({
      ios: "maps:0,0?q=",
      android: "geo:0,0?q=",
    });
    const latLng = `${lot.latitude},${lot.longitude}`;
    const label = lot.name;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`,
    });
    if (url) Linking.openURL(url);
  };

  const occColor = getOccupancyColor(lot.occupancyRate);
  const isDisabled = !user || lot.occupancyRate >= 100;

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
    lot.evCharging > 0 && {
      icon: "bolt.car.fill",
      label: "EV Charging",
      color: "#60a5fa",
      bg: "rgba(59,130,246,0.12)",
      border: "rgba(59,130,246,0.3)",
    },
    lot.handicapped > 0 && {
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

  return (
    <>
      <TouchableWithoutFeedback onPress={() => scrollToSnap(SNAP_HIDDEN)}>
        <Animated.View
          style={[styles.overlay, StyleSheet.absoluteFill, backdropStyle]}
        />
      </TouchableWithoutFeedback>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.container, animatedStyle]}>
          <GlassBackground
            style={StyleSheet.absoluteFill}
            glassStyle="regular"
            blurIntensity={100}
            blurTint="systemThickMaterialDark"
            fallbackColor="rgba(12,12,15,0.95)"
          />

          {/* Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <Animated.ScrollView
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={true}
          >
            {/* ── Header ── */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                {lot.campus ? (
                  <View style={styles.campusPill}>
                    <Text style={styles.campusPillText}>
                      {lot.campus} Campus
                    </Text>
                  </View>
                ) : null}
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text style={styles.lotName}>{lot.name}</Text>
                  {permitValidity !== null && (
                    <View
                      style={[
                        styles.permitBadge,
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
                        color={permitValidity ? "#4ade80" : "#52525b"}
                      />
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.headerRight}>
                {user && onToggleFavorite && (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      onToggleFavorite();
                    }}
                    style={styles.iconBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <IconSymbol
                      name={isFavorite ? "star.fill" : "star"}
                      size={20}
                      color={isFavorite ? "#f59e0b" : "#71717a"}
                    />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    scrollToSnap(SNAP_HIDDEN);
                  }}
                  style={styles.iconBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <IconSymbol name="xmark" size={14} color="#71717a" />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Stats row ── */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={[styles.statVal, { color: occColor }]}>
                  {Math.round(lot.occupancyRate)}%
                </Text>
                <Text style={styles.statLab}>Full</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{lot.occupiedCount}</Text>
                <Text style={styles.statLab}>Sessions</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{lot.capacity}</Text>
                <Text style={styles.statLab}>Capacity</Text>
              </View>
            </View>

            {/* ── Occupancy bar ── */}
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(100, lot.occupancyRate)}%` as any,
                    backgroundColor: occColor,
                  },
                ]}
              />
            </View>

            {/* ── Feature badges ── */}
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
                    <IconSymbol
                      name={f.icon as any}
                      size={11}
                      color={f.color}
                    />
                    <Text style={[styles.featurePillText, { color: f.color }]}>
                      {f.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Schedule info ── */}
            {scheduleInfo && (
              <View style={styles.scheduleSection}>
                <View style={styles.scheduleHeader}>
                  <IconSymbol name="clock.fill" size={13} color="#71717a" />
                  <Text style={styles.scheduleTitle}>SCHEDULE</Text>
                  {lotAvailable !== null && (
                    <View
                      style={[
                        styles.availBadge,
                        lotAvailable
                          ? styles.availBadgeOpen
                          : styles.availBadgeClosed,
                      ]}
                    >
                      <View
                        style={[
                          styles.availDot,
                          {
                            backgroundColor: lotAvailable
                              ? "#4ade80"
                              : "#ef4444",
                          },
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
                  )}
                </View>
                {scheduleInfo.time_text_1 ? (
                  <Text style={styles.scheduleText}>
                    {scheduleInfo.time_text_1}
                  </Text>
                ) : null}
                {scheduleInfo.time_text_2 ? (
                  <Text style={styles.scheduleText}>
                    {scheduleInfo.time_text_2}
                  </Text>
                ) : null}
              </View>
            )}

            {/* ── Notes ── */}
            {lot.note ? (
              <View style={styles.notesSection}>
                <View style={styles.notesHeader}>
                  <IconSymbol
                    name="info.circle.fill"
                    size={13}
                    color="#71717a"
                  />
                  <Text style={styles.notesTitle}>NOTES</Text>
                </View>
                <Text style={styles.notesText}>{lot.note}</Text>
              </View>
            ) : null}

            {/* ── Forecast chart ── */}
            <ForecastChart curve={forecast} isLoading={isLoadingForecast} />

            {/* ── Actions ── */}
            <View style={styles.actionsRow}>
              {!activeSession && (
                <TouchableOpacity
                  style={[styles.parkBtn, isDisabled && styles.parkBtnDisabled]}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (user && lot.occupancyRate < 100) {
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
                  disabled={isParking || isDisabled}
                  activeOpacity={0.8}
                >
                  <IconSymbol name="p.circle.fill" size={20} color="#fff" />
                  <Text style={styles.parkBtnText}>{renderActionText()}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.dirBtn,
                  !activeSession && { flex: 0, paddingHorizontal: 20 },
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  openDirections();
                }}
                activeOpacity={0.8}
              >
                <IconSymbol
                  name="arrow.triangle.turn.up.right.diamond.fill"
                  size={18}
                  color="#60a5fa"
                />
                {!!activeSession && (
                  <Text style={styles.dirBtnText}>Directions</Text>
                )}
              </TouchableOpacity>
            </View>

            {!user && (
              <Text style={styles.signInNote}>
                Sign in from the Profile tab to log parking sessions
              </Text>
            )}

            <View style={{ height: 36 }} />
          </Animated.ScrollView>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(0,0,0,1)", // Controlled by animated opacity
  },
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_H,
    backgroundColor: "transparent",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    // thin top border for visual depth
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  handleWrap: { alignItems: "center", paddingTop: 8, paddingBottom: 10 },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2.5,
  },

  scroll: { width: "100%" },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4 },

  // Header
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
  lotName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fafafa",
    letterSpacing: -0.3,
    lineHeight: 30,
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

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 4,
  },
  statVal: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f4f4f5",
    fontVariant: ["tabular-nums"],
  },
  statLab: { fontSize: 12, color: "#71717a", fontWeight: "500" },

  // Occupancy bar
  barTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    marginBottom: 20,
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },

  // Feature badges
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

  // Permit badge (inline after lot name)
  permitBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Schedule
  scheduleSection: {
    marginBottom: 16,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  scheduleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  scheduleTitle: {
    color: "#71717a",
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
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
  },

  // Notes
  notesSection: {
    marginBottom: 16,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  notesTitle: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  notesText: {
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
  },

  // Actions
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
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
    flex: 1,
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
});
