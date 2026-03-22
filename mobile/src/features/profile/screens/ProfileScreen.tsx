import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
  Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import { GlassCard } from "@/shared/components/ui/GlassCard";
import { GlassBackground } from "@/shared/components/ui/GlassBackground";
import { ScarletSpotsBackground } from "@/shared/components/ui/ScarletSpotsBackground";
import {
  GLASS_DARK,
  type GlassThemePalette,
  useGlassTheme,
} from "@/shared/components/ui/glassTheme";
import {
  useThemePreference,
  type ThemePreference,
} from "@/providers/ThemePreferenceProvider";
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


// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOccupancyColor(rate: number) {
  if (rate >= 90) return "#ef4444";
  if (rate >= 65) return "#f59e0b";
  return "#10b981";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CampusToggleCard({
  campus,
  icon,
  sublabel,
  enabled,
  onToggle,
}: Readonly<{
  campus: string;
  icon: string;
  sublabel: string;
  enabled: boolean;
  onToggle: () => void;
}>) {
  const theme = useGlassTheme();
  return (
    <View
      style={[
        campusCardStyles.card,
        { borderBottomColor: theme.borderColor },
      ]}
    >
      <View style={campusCardStyles.left}>
        <View style={[campusCardStyles.iconWrap, { backgroundColor: theme.accentSubtle, borderColor: theme.accentBorder }]}>
          <IconSymbol name={icon as any} size={20} color={theme.accent} />
        </View>
        <View>
          <Text style={[campusCardStyles.name, { color: theme.textPrimary }]}>
            {campus}
          </Text>
          <Text style={[campusCardStyles.sub, { color: theme.textMuted }]}>
            {sublabel}
          </Text>
        </View>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{
          false: theme === GLASS_DARK ? "#2a2a2e" : "#e4e4e7",
          true: theme === GLASS_DARK ? "rgba(220,38,38,0.45)" : "rgba(204,0,51,0.45)",
        }}
        thumbColor="#ffffff"
        ios_backgroundColor={theme === GLASS_DARK ? "#2a2a2e" : "#e4e4e7"}
      />
    </View>
  );
}

const campusCardStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 15, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 2 },
});

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
  const theme = useGlassTheme();
  return (
    <TouchableOpacity
      style={[
        settingStyles.row,
        { borderBottomColor: theme.borderColor },
        last && settingStyles.rowLast,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[settingStyles.iconWrap, { backgroundColor: iconBg }]}>
        <IconSymbol name={icon as any} size={16} color={iconColor} />
      </View>
      <View style={settingStyles.text}>
        <Text
          style={[
            settingStyles.label,
            { color: theme.textPrimary },
            destructive && { color: "#ef4444" },
          ]}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text style={[settingStyles.subtext, { color: theme.textMuted }]}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {right ?? (
        <IconSymbol name="chevron.right" size={13} color={theme.textDim} />
      )}
    </TouchableOpacity>
  );
}

const settingStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  rowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  text: { flex: 1 },
  label: { fontSize: 15, fontWeight: "600" },
  subtext: { fontSize: 12, marginTop: 1 },
});

function SavedLotCard({
  lot,
  onPress,
}: Readonly<{ lot: RutgersLot; onPress: () => void }>) {
  const theme = useGlassTheme();
  const rate = lot.occupancyRate;
  const color = getOccupancyColor(rate);
  const pct = Math.round(rate);
  const label = rate >= 90 ? "Full" : "Occupancy";

  return (
    <TouchableOpacity
      style={[lotCardStyles.card, { borderBottomColor: theme.borderColor }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[lotCardStyles.iconWrap, { backgroundColor: theme.accentSubtle, borderColor: theme.accentBorder }]}>
        <IconSymbol name="car.fill" size={22} color={theme.accent} />
      </View>
      <View style={lotCardStyles.textGroup}>
        <Text
          style={[lotCardStyles.name, { color: theme.textPrimary }]}
          numberOfLines={1}
        >
          {lot.name}
        </Text>
        <Text style={[lotCardStyles.sub, { color: theme.textMuted }]}>
          {lot.campus} Campus
        </Text>
      </View>
      <View style={lotCardStyles.rightGroup}>
        <Text style={[lotCardStyles.pct, { color }]}>{pct}%</Text>
        <Text style={[lotCardStyles.pctLabel, { color: theme.textMuted }]}>
          {label}
        </Text>
        <View
          style={[
            lotCardStyles.barBg,
            { backgroundColor: theme === GLASS_DARK ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" },
          ]}
        >
          <View
            style={[
              lotCardStyles.barFill,
              { width: `${Math.min(pct, 100)}%` as any, backgroundColor: color },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const lotCardStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  textGroup: { flex: 1 },
  name: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  sub: { fontSize: 12, marginTop: 3 },
  rightGroup: { alignItems: "flex-end", gap: 2 },
  pct: { fontSize: 16, fontWeight: "800" },
  pctLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  barBg: {
    width: 52,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 2,
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
  },
});

// ─── Campus metadata for the toggle cards ────────────────────────────────────

const CAMPUS_META: Record<string, { icon: string; sublabel: string }> = {
  Busch: { icon: "building.2.fill", sublabel: "Science & Engineering" },
  "College Ave": { icon: "building.2.fill", sublabel: "Historic Center & Student Life" },
  Livingston: { icon: "building.2.fill", sublabel: "Business & Athletics" },
  Cook: { icon: "building.2.fill", sublabel: "Cook Campus" },
  Douglass: { icon: "building.2.fill", sublabel: "Douglass Campus" },
  "Health - Piscataway": { icon: "building.2.fill", sublabel: "Health Sciences" },
  "Health - New Brunswick": { icon: "building.2.fill", sublabel: "Health Sciences" },
};

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const theme = useGlassTheme();
  const { preference, setPreference } = useThemePreference();
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

  const styles = useMemo(() => createStyles(theme), [theme]);

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
            borderRadius={theme.radiusLarge}
          >
            <View style={styles.notSignedInAvatar}>
              <IconSymbol name="person.fill" size={40} color={theme.textDim} />
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

  const primaryCampuses = NB_CAMPUS_NAMES;

  // ── Main profile ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme === GLASS_DARK ? "light-content" : "dark-content"} />
      <ScarletSpotsBackground />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Identity hero ──────────────────────────────────────────────── */}
        <GlassCard
          style={styles.heroCard}
          contentStyle={styles.heroContent}
          blurIntensity={theme.blurMedium}
          borderRadius={28}
        >
          {/* Scarlet radial glow behind avatar */}
          <View style={styles.avatarGlow} />

          {/* Avatar */}
          <View style={styles.avatarRing}>
            <LinearGradient
              colors={theme === GLASS_DARK ? ["rgba(220,38,38,0.55)", "rgba(220,38,38,0.10)"] : ["rgba(204,0,51,0.55)", "rgba(204,0,51,0.10)"]}
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

          {/* Permit badge */}
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
              color={theme.accent}
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
              color={theme.textMuted}
            />
          </TouchableOpacity>

          <Text style={styles.heroSince}>Member since {memberSince}</Text>
        </GlassCard>

        {/* ── Stats strip ────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <GlassCard
            style={styles.statCard}
            contentStyle={styles.statContent}
            blurIntensity={theme.blurLight}
          >
            <Text style={[styles.statValue, { color: theme.accent }]}>
              {favorites.length}
            </Text>
            <Text style={styles.statLabel}>Saved Lots</Text>
          </GlassCard>
          <GlassCard
            style={styles.statCard}
            contentStyle={styles.statContent}
            blurIntensity={theme.blurLight}
          >
            <Text style={styles.statValue}>
              {enabledCampuses.size}/{NB_CAMPUS_NAMES.length}
            </Text>
            <Text style={styles.statLabel}>Campuses</Text>
          </GlassCard>
          <GlassCard
            style={styles.statCard}
            contentStyle={styles.statContent}
            blurIntensity={theme.blurLight}
          >
            <Text style={styles.statValue}>NB</Text>
            <Text style={styles.statLabel}>Campus</Text>
          </GlassCard>
        </View>

        {/* ── Saved Lots ─────────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>SAVED LOTS</Text>
          {favorites.length > 0 && (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/(tabs)" as any,
                  params: { selectedLotId: favorites[0].id },
                })
              }
            >
              <Text style={styles.sectionAction}>View Map</Text>
            </TouchableOpacity>
          )}
        </View>

        <GlassCard
          style={styles.listCard}
          contentStyle={styles.listCardContent}
          blurIntensity={theme.blurMedium}
          borderRadius={24}
        >
          {favorites.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <IconSymbol name="star" size={24} color={theme.textDim} />
              </View>
              <Text style={styles.emptyTitle}>No saved lots</Text>
              <Text style={styles.emptySub}>
                Long-press any lot on the map to save it
              </Text>
            </View>
          ) : (
            favorites.map((lot, i) => (
              <View
                key={lot.id}
                style={i === favorites.length - 1 ? styles.lastCard : undefined}
              >
                <SavedLotCard
                  lot={lot}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)" as any,
                      params: { selectedLotId: lot.id },
                    })
                  }
                />
              </View>
            ))
          )}
        </GlassCard>

        {/* ── Preferences ────────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>PREFERENCES</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Customize your campus parking experience.
        </Text>

        {/* Appearance sub-section */}
        <Text style={styles.prefGroupLabel}>Appearance</Text>
        <GlassCard
          style={styles.listCard}
          contentStyle={styles.listCardContent}
          blurIntensity={theme.blurMedium}
          borderRadius={24}
        >
          {(
            [
              { key: "system", label: "System Default", icon: "circle.lefthalf.filled" },
              { key: "light", label: "Light", icon: "sun.max.fill" },
              { key: "dark", label: "Dark", icon: "moon.fill" },
            ] as { key: ThemePreference; label: string; icon: string }[]
          ).map(({ key, label, icon }, i) => (
            <TouchableOpacity
              key={key}
              style={[
                appearanceStyles.row,
                { borderBottomColor: theme.borderColor },
                i === 2 && appearanceStyles.rowLast,
              ]}
              onPress={() => setPreference(key)}
              activeOpacity={0.7}
            >
              <View style={[appearanceStyles.iconWrap, { backgroundColor: theme.iconBg }]}>
                <IconSymbol name={icon as any} size={16} color={theme.iconColor} />
              </View>
              <Text style={[appearanceStyles.label, { color: theme.textPrimary }]}>
                {label}
              </Text>
              {preference === key && (
                <IconSymbol name="checkmark" size={15} color={theme.accent} />
              )}
            </TouchableOpacity>
          ))}
        </GlassCard>

        {/* Campus filter sub-section */}
        <Text style={[styles.prefGroupLabel, { marginTop: 20 }]}>Campus Filter</Text>
        <GlassCard
          style={styles.listCard}
          contentStyle={styles.listCardContent}
          blurIntensity={theme.blurMedium}
          borderRadius={24}
        >
          {primaryCampuses.map((campus, i) => {
            const meta = CAMPUS_META[campus] ?? {
              icon: "building.2.fill",
              sublabel: campus,
            };
            const isLast = i === primaryCampuses.length - 1;
            return (
              <View
                key={campus}
                style={isLast ? styles.lastCard : undefined}
              >
                <CampusToggleCard
                  campus={campus}
                  icon={meta.icon}
                  sublabel={meta.sublabel}
                  enabled={enabledCampuses.has(campus)}
                  onToggle={() => toggleCampus(campus)}
                />
              </View>
            );
          })}
        </GlassCard>

        {/* Notifications sub-section */}
        <Text style={[styles.prefGroupLabel, { marginTop: 20 }]}>
          Notifications
        </Text>
        <GlassCard
          style={styles.listCard}
          contentStyle={styles.listCardContent}
          blurIntensity={theme.blurMedium}
          borderRadius={24}
        >
          <SettingRow
            icon="bell.fill"
            iconBg={theme.accentSubtle}
            iconColor={theme.accent}
            label="Push Notifications"
            sublabel="Session alerts & reminders"
            last
          />
        </GlassCard>

        {/* ── Account ────────────────────────────────────────────────────── */}
        <View style={[styles.sectionHeader, { marginTop: 28 }]}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Manage your security and session.
        </Text>

        <GlassCard
          style={styles.listCard}
          contentStyle={styles.listCardContent}
          blurIntensity={theme.blurMedium}
          borderRadius={24}
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
            blurIntensity={theme.blurLight}
          />
          <IconSymbol
            name="rectangle.portrait.and.arrow.right"
            size={18}
            color={theme.accent}
          />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 130 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const appearanceStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  label: { flex: 1, fontSize: 15, fontWeight: "600" },
});

function createStyles(theme: GlassThemePalette) {
  return StyleSheet.create({
    container: { flex: 1 },

    scrollView: { flex: 1 },
    scrollContent: {
      paddingTop: Platform.OS === "ios" ? 68 : 50,
      paddingHorizontal: 16,
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
    },
    notSignedInAvatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme === GLASS_DARK ? "#18181b" : "#e4e4e7",
      borderWidth: 1,
      borderColor: theme === GLASS_DARK ? "#27272a" : "#d4d4d8",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 6,
    },
    notLoggedInText: { color: theme.textPrimary, fontSize: 20, fontWeight: "700" },
    notLoggedInSub: {
      color: theme.textMuted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
    },
    loginButton: {
      marginTop: 10,
      backgroundColor: theme.accent,
      paddingVertical: 14,
      paddingHorizontal: 48,
      borderRadius: 14,
    },
    loginButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },

    // ── Hero card ──
    heroCard: { marginBottom: 0 },
    heroContent: {
      alignItems: "center",
      paddingVertical: 32,
      paddingHorizontal: 20,
    },
    avatarGlow: {
      position: "absolute",
      top: 16,
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: theme.accentSubtle,
    },
    avatarRing: {
      width: 96,
      height: 96,
      borderRadius: 48,
      overflow: "hidden",
      padding: 2,
      marginBottom: 18,
    },
    avatarInner: {
      flex: 1,
      borderRadius: 46,
      backgroundColor: theme === GLASS_DARK ? "#0d0d0f" : "#f0f0f2",
      justifyContent: "center",
      alignItems: "center",
    },
    avatarText: {
      fontSize: 38,
      fontWeight: "800",
      fontStyle: "italic",
      color: theme.accent,
      letterSpacing: -1,
    },
    heroName: {
      fontSize: 26,
      fontWeight: "800",
      color: theme.textPrimary,
      letterSpacing: -0.5,
    },
    heroEmail: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 4,
      marginBottom: 14,
    },
    heroSince: {
      fontSize: 11,
      color: theme.textDim,
      marginTop: 12,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    permitBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 20,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accentBorder,
      backgroundColor: theme.accentSubtle,
    },
    permitBadgeText: { color: theme.accent, fontSize: 13, fontWeight: "700" },
    permitBadgeSecondary: { color: theme.textMuted, fontSize: 12 },

    // ── Stats strip ──
    statsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
    statCard: { flex: 1 },
    statContent: {
      alignItems: "center",
      paddingVertical: 16,
      paddingHorizontal: 8,
      gap: 4,
    },
    statValue: {
      fontSize: 20,
      fontWeight: "800",
      color: theme.textPrimary,
      letterSpacing: -0.5,
    },
    statLabel: {
      fontSize: 10,
      color: theme.textMuted,
      fontWeight: "600",
      letterSpacing: 0.3,
      textTransform: "uppercase",
      textAlign: "center",
    },

    // ── Section headers ──
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 26,
      marginBottom: 6,
      paddingHorizontal: 4,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.textMuted,
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    sectionAction: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.accent,
    },
    sectionDesc: {
      fontSize: 13,
      color: theme.textMuted,
      paddingHorizontal: 4,
      marginBottom: 12,
      lineHeight: 18,
    },
    prefGroupLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: theme.textDim,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      paddingHorizontal: 4,
      marginBottom: 10,
    },

    // ── Card containers ──
    listCard: {},
    listCardContent: { padding: 0 },
    lastCard: { borderBottomWidth: 0 },

    // ── Empty state ──
    emptyState: {
      alignItems: "center",
      paddingVertical: 32,
      paddingHorizontal: 12,
      gap: 8,
    },
    emptyIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: theme === GLASS_DARK ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 4,
    },
    emptyTitle: { color: theme.textMuted, fontSize: 15, fontWeight: "600" },
    emptySub: {
      color: theme.textDim,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
    },

    // ── Sign out ──
    signOutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginTop: 22,
      paddingVertical: 16,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.accentBorder,
      backgroundColor: theme.accentSubtle,
    },
    signOutText: { color: theme.accent, fontSize: 15, fontWeight: "700" },
  });
}
