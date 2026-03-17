import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import { GlassCard } from "@/shared/components/ui/GlassCard";
import { GlassBackground } from "@/shared/components/ui/GlassBackground";
import { ScarletSpotsBackground } from "@/shared/components/ui/ScarletSpotsBackground";
import { GLASS } from "@/shared/components/ui/glassTheme";
import { authApiCall } from "@/shared/api/supabase";
import { useFocusEffect } from "@react-navigation/native";
import {
  getLotById,
  type RutgersLot,
  NB_CAMPUS_NAMES,
} from "@/shared/constants/lots";
import {
  fetchWithOfflineFallback,
  cacheFavorites,
} from "@/shared/services/OfflineCache";

const FLAT_CARD_BG = "#1c1d21";
const FLAT_CARD_BORDER = "rgba(255,255,255,0.11)";

// ─── Sub-components ──────────────────────────────────────────────────────────

function SettingRow({
  icon,
  iconBg,
  iconColor,
  label,
  sublabel,
  onPress,
  destructive = false,
  last = false,
  right,
}: Readonly<{
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
  right?: React.ReactNode;
}>) {
  return (
    <TouchableOpacity
      style={[styles.settingRow, last && styles.settingRowLast]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.settingIconWrap, { backgroundColor: iconBg }]}>
        <IconSymbol name={icon as any} size={15} color={iconColor} />
      </View>
      <View style={styles.settingText}>
        <Text
          style={[styles.settingLabel, destructive && { color: "#ef4444" }]}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text style={styles.settingSubtext}>{sublabel}</Text>
        ) : null}
      </View>
      {right ?? (
        <IconSymbol name="chevron.right" size={13} color={GLASS.textDim} />
      )}
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const {
    session,
    user,
    loading,
    signOut,
    permitType,
    secondaryPermitType,
    noPermitMode,
    enabledCampuses,
    toggleCampus,
  } = useAuth();
  const router = useRouter();
  const [favorites, setFavorites] = useState<RutgersLot[]>([]);
  const [showCampuses, setShowCampuses] = useState(false);

  const fetchFavorites = React.useCallback(async () => {
    if (!session) return;
    try {
      const { data: ids } = await fetchWithOfflineFallback(
        async () => {
          const resp = await authApiCall("/favorites");
          const lotIds = (resp?.favorite_lots as { lot_id: string }[]).map(
            (item) => item.lot_id,
          );
          await cacheFavorites(lotIds);
          return lotIds;
        },
        "favorites_cache",
        1000 * 60 * 5,
      );
      const lots = ids
        .map((id: string) => getLotById(id))
        .filter((lot): lot is RutgersLot => lot !== undefined);
      setFavorites(lots);
    } catch (e) {
      console.error("Failed to fetch favorites:", e);
    }
  }, [session]);

  useFocusEffect(
    React.useCallback(() => {
      if (session) fetchFavorites();
    }, [session, fetchFavorites]),
  );

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (!loading && !session) {
    return (
      <View style={styles.container}>
        <ScarletSpotsBackground />
        <View style={styles.centerContent}>
          <GlassCard
            style={styles.notSignedInCard}
            contentStyle={styles.notSignedInCardContent}
            borderRadius={GLASS.radiusLarge}
            borderColor={FLAT_CARD_BORDER}
          >
            <View style={styles.notSignedInAvatar}>
              <IconSymbol name="person.fill" size={40} color={GLASS.textDim} />
            </View>
            <Text style={styles.notLoggedInText}>Not signed in</Text>
            <Text style={styles.notLoggedInSub}>
              Sign in to view your profile and parking history
            </Text>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => router.replace("/auth/login" as any)}
            >
              <Text style={styles.loginButtonText}>Sign In</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </View>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const initials = user?.email?.charAt(0).toUpperCase() ?? "?";
  const emailName = user?.email?.split("@")[0] ?? "";
  const memberSince = new Date(user?.created_at ?? "").toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );

  const getPermitLabel = (): string => {
    if (!permitType) return "No permit set";
    if (noPermitMode === "all") return "Show all lots";
    if (noPermitMode === "commuter_all") return "All commuter lots";
    return permitType;
  };

  // ── Main profile ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScarletSpotsBackground />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page title ─────────────────────────────────────────────────── */}
        <Text style={styles.pageTitle}>Profile</Text>

        {/* ── Identity hero ──────────────────────────────────────────────── */}
        <GlassCard
          style={styles.heroCard}
          contentStyle={styles.heroContent}
          blurIntensity={GLASS.blurMedium}
          borderRadius={GLASS.radiusLarge}
          borderColor={FLAT_CARD_BORDER}
        >
          {/* Subtle scarlet glow behind avatar */}
          <View style={styles.avatarGlow} />

          <View style={styles.avatarRing}>
            <LinearGradient
              colors={["rgba(220,38,38,0.45)", "rgba(220,38,38,0.08)"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.avatarInner}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          <Text style={styles.heroName}>{emailName}</Text>
          <Text style={styles.heroEmail} numberOfLines={1}>
            {user?.email}
          </Text>
          <Text style={styles.heroSince}>Member since {memberSince}</Text>

          {/* Permit badge row */}
          <TouchableOpacity
            style={styles.permitBadge}
            onPress={() =>
              router.push("/onboarding/permit?fromProfile=true" as any)
            }
            activeOpacity={0.75}
          >
            <IconSymbol
              name="parkingsign.circle.fill"
              size={14}
              color={GLASS.accent}
            />
            <Text style={styles.permitBadgeText}>{getPermitLabel()}</Text>
            {secondaryPermitType ? (
              <Text style={styles.permitBadgeSecondary}>
                + {secondaryPermitType}
              </Text>
            ) : null}
            <IconSymbol
              name="chevron.right"
              size={11}
              color={GLASS.textMuted}
            />
          </TouchableOpacity>
        </GlassCard>

        {/* ── Stats strip ────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <GlassCard
            style={styles.statCard}
            contentStyle={styles.statContent}
            blurIntensity={GLASS.blurLight}
            borderColor={FLAT_CARD_BORDER}
          >
            <Text style={styles.statValue}>{favorites.length}</Text>
            <Text style={styles.statLabel}>Saved Lots</Text>
          </GlassCard>
          <GlassCard
            style={styles.statCard}
            contentStyle={styles.statContent}
            blurIntensity={GLASS.blurLight}
            borderColor={FLAT_CARD_BORDER}
          >
            <Text style={styles.statValue}>
              {enabledCampuses.size}/{NB_CAMPUS_NAMES.length}
            </Text>
            <Text style={styles.statLabel}>Campuses</Text>
          </GlassCard>
          <GlassCard
            style={styles.statCard}
            contentStyle={styles.statContent}
            blurIntensity={GLASS.blurLight}
            borderColor={FLAT_CARD_BORDER}
          >
            <Text style={styles.statValue}>NB</Text>
            <Text style={styles.statLabel}>Campus</Text>
          </GlassCard>
        </View>

        {/* ── Saved Lots ─────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>SAVED LOTS</Text>
        <GlassCard
          style={styles.listCard}
          contentStyle={styles.listCardContent}
          blurIntensity={GLASS.blurMedium}
          borderRadius={GLASS.radiusLarge}
          borderColor={FLAT_CARD_BORDER}
        >
          {favorites.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <IconSymbol name="star" size={24} color={GLASS.textDim} />
              </View>
              <Text style={styles.emptyTitle}>No saved lots</Text>
              <Text style={styles.emptySub}>
                Long-press any lot on the map to save it
              </Text>
            </View>
          ) : (
            favorites.map((lot, i) => (
              <TouchableOpacity
                key={lot.id}
                style={[
                  styles.favRow,
                  i === favorites.length - 1 && styles.favRowLast,
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/" as any,
                    params: { selectedLotId: lot.id },
                  })
                }
                activeOpacity={0.75}
              >
                <View style={styles.favIconWrap}>
                  <IconSymbol name="car.fill" size={14} color="#f59e0b" />
                </View>
                <View style={styles.favTextGroup}>
                  <Text style={styles.favName}>{lot.name}</Text>
                  <Text style={styles.favSub}>{lot.campus} Campus</Text>
                </View>
                <IconSymbol
                  name="chevron.right"
                  size={13}
                  color={GLASS.textDim}
                />
              </TouchableOpacity>
            ))
          )}
        </GlassCard>

        {/* ── Preferences ────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <GlassCard
          style={styles.listCard}
          contentStyle={styles.listCardContent}
          blurIntensity={GLASS.blurMedium}
          borderRadius={GLASS.radiusLarge}
          borderColor={FLAT_CARD_BORDER}
        >
          <SettingRow
            icon="building.2.fill"
            iconBg="rgba(34,197,94,0.12)"
            iconColor="#4ade80"
            label="Campus Filter"
            sublabel={`${enabledCampuses.size} of ${NB_CAMPUS_NAMES.length} active`}
            onPress={() => setShowCampuses((p) => !p)}
            right={
              <IconSymbol
                name={showCampuses ? "chevron.up" : "chevron.down"}
                size={13}
                color={GLASS.textDim}
              />
            }
          />

          {showCampuses && (
            <View style={styles.campusPanel}>
              {NB_CAMPUS_NAMES.map((campus) => {
                const enabled = enabledCampuses.has(campus);
                return (
                  <TouchableOpacity
                    key={campus}
                    style={styles.campusRow}
                    onPress={() => toggleCampus(campus)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.campusName,
                        !enabled && styles.campusNameOff,
                      ]}
                    >
                      {campus}
                    </Text>
                    <View
                      style={[
                        styles.campusToggle,
                        enabled && styles.campusToggleOn,
                      ]}
                    >
                      <View
                        style={[
                          styles.campusThumb,
                          enabled && styles.campusThumbOn,
                        ]}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <SettingRow
            icon="bell.fill"
            iconBg="rgba(59,130,246,0.12)"
            iconColor="#3b82f6"
            label="Notifications"
            sublabel="Session alerts & reminders"
            last
          />
        </GlassCard>

        {/* ── Account ────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <GlassCard
          style={styles.listCard}
          contentStyle={styles.listCardContent}
          blurIntensity={GLASS.blurMedium}
          borderRadius={GLASS.radiusLarge}
          borderColor={FLAT_CARD_BORDER}
        >
          <SettingRow
            icon="lock.fill"
            iconBg="rgba(161,161,170,0.12)"
            iconColor="#a1a1aa"
            label="Change Password"
            last
          />
        </GlassCard>

        {/* ── Sign out ───────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={signOut}
          activeOpacity={0.8}
        >
          <GlassBackground
            style={StyleSheet.absoluteFill}
            glassStyle="clear"
            blurIntensity={GLASS.blurLight}
            blurTint={GLASS.tintDark}
            fallbackColor="rgba(12,12,14,0.6)"
          />
          <IconSymbol
            name="rectangle.portrait.and.arrow.right"
            size={16}
            color={GLASS.accent}
          />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingTop: Platform.OS === "ios" ? 64 : 48,
    paddingHorizontal: 16,
  },

  // ── Page title ──
  pageTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: GLASS.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 20,
  },

  // ── Section labels ──
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: GLASS.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 20,
    marginLeft: 4,
  },

  // ── Not signed in ──
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  notSignedInCard: { width: "100%" },
  notSignedInCardContent: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 10,
    padding: 24,
    backgroundColor: FLAT_CARD_BG,
  },
  notSignedInAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  notLoggedInText: {
    color: GLASS.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  notLoggedInSub: {
    color: GLASS.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  loginButton: {
    marginTop: 10,
    backgroundColor: GLASS.accent,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 14,
  },
  loginButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // ── Hero ──
  heroCard: { marginBottom: 0 },
  heroContent: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: FLAT_CARD_BG,
  },
  avatarGlow: {
    position: "absolute",
    top: 16,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(220,38,38,0.07)",
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: "hidden",
    padding: 2,
    marginBottom: 16,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 42,
    backgroundColor: "#0f0f12",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 34,
    fontWeight: "800",
    color: GLASS.accent,
    letterSpacing: -1,
  },
  heroName: {
    fontSize: 22,
    fontWeight: "700",
    color: GLASS.textPrimary,
    letterSpacing: -0.3,
  },
  heroEmail: {
    fontSize: 13,
    color: GLASS.textMuted,
    marginTop: 3,
    marginBottom: 4,
  },
  heroSince: {
    fontSize: 12,
    color: GLASS.textDim,
    marginBottom: 20,
  },
  // Permit badge inside hero
  permitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: FLAT_CARD_BORDER,
    backgroundColor: "#24262c",
  },
  permitBadgeText: {
    color: GLASS.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  permitBadgeSecondary: {
    color: GLASS.textMuted,
    fontSize: 12,
  },

  // ── Stats strip ──
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  statCard: { flex: 1 },
  statContent: {
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 3,
    backgroundColor: FLAT_CARD_BG,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: GLASS.textPrimary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: GLASS.textMuted,
    fontWeight: "500",
  },

  // ── List card (shared by Saved Lots, Preferences, Account) ──
  listCard: {},
  listCardContent: { padding: 6, backgroundColor: FLAT_CARD_BG },

  // ── Setting row ──
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
    gap: 12,
  },
  settingRowLast: { borderBottomWidth: 0 },
  settingIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  settingText: { flex: 1 },
  settingLabel: {
    color: "#d4d4d8",
    fontSize: 15,
    fontWeight: "500",
  },
  settingSubtext: {
    color: GLASS.textMuted,
    fontSize: 12,
    marginTop: 1,
  },

  // ── Campus expand panel ──
  campusPanel: {
    marginHorizontal: 10,
    marginBottom: 4,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  campusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  campusName: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "500",
  },
  campusNameOff: { color: GLASS.textMuted },
  campusToggle: {
    width: 42,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#27272a",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  campusToggleOn: { backgroundColor: "rgba(34,197,94,0.3)" },
  campusThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: GLASS.textMuted,
  },
  campusThumbOn: {
    backgroundColor: "#4ade80",
    alignSelf: "flex-end",
  },

  // ── Favorites ──
  favRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
    gap: 12,
  },
  favRowLast: { borderBottomWidth: 0 },
  favIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "rgba(245,158,11,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  favTextGroup: { flex: 1 },
  favName: { color: "#e4e4e7", fontSize: 14, fontWeight: "500" },
  favSub: { color: GLASS.textMuted, fontSize: 12, marginTop: 1 },

  // ── Empty state ──
  emptyState: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 10,
    gap: 8,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  emptyTitle: { color: GLASS.textMuted, fontSize: 15, fontWeight: "600" },
  emptySub: {
    color: GLASS.textDim,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },

  // ── Sign out ──
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    marginBottom: 0,
    paddingVertical: 15,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: FLAT_CARD_BORDER,
    backgroundColor: FLAT_CARD_BG,
  },
  signOutText: { color: GLASS.accent, fontSize: 15, fontWeight: "600" },
});
