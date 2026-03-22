import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SectionList,
  TextInput,
  Platform,
  useColorScheme,
} from "react-native";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import { ScarletSpotsBackground } from "@/shared/components/ui/ScarletSpotsBackground";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { ALL_PERMIT_TYPES } from "@/shared/constants/lots";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";

// ── Types ──────────────────────────────────────────────────────────────────

type NoPermitSubMode = null | "all" | "commuter_all";

// ── Permit grouping ────────────────────────────────────────────────────────

interface PermitSection {
  title: string;
  data: string[];
}

function groupPermits(permits: string[], query: string): PermitSection[] {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? permits.filter((p) => p.toLowerCase().includes(q))
    : permits;

  const groups: Record<string, string[]> = {
    Commuter: [],
    Resident: [],
    "Faculty & Staff": [],
    "Health & Hospital": [],
    "Non-Affiliate": [],
    "Retiree & Senior": [],
    Visitor: [],
    Other: [],
  };

  for (const p of filtered) {
    if (p.includes("Commuter")) groups["Commuter"].push(p);
    else if (p.includes("Resident")) groups["Resident"].push(p);
    else if (p.includes("Faculty") || p.includes("Staff"))
      groups["Faculty & Staff"].push(p);
    else if (p.includes("Health") || p.includes("Hospital"))
      groups["Health & Hospital"].push(p);
    else if (p.includes("Non-Affiliate")) groups["Non-Affiliate"].push(p);
    else if (p.includes("Retiree") || p.includes("Senior"))
      groups["Retiree & Senior"].push(p);
    else if (p.includes("Visitor")) groups["Visitor"].push(p);
    else groups["Other"].push(p);
  }

  return Object.entries(groups)
    .filter(([, data]) => data.length > 0)
    .map(([title, data]) => ({ title, data }));
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function PermitScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  const { fromProfile } = useLocalSearchParams<{ fromProfile?: string }>();
  const isFromProfile = fromProfile === "true";

  const {
    permitType,
    secondaryPermitType,
    setPermitPreference,
    setSecondaryPermitPreference,
  } = useAuth();

  // Selection state
  const [selected, setSelected] = useState<string | null>(permitType);
  const [secondarySelected, setSecondarySelected] = useState<string | null>(
    secondaryPermitType,
  );

  const [noPermitExpanded, setNoPermitExpanded] = useState(
    permitType === "__commuter_all" || permitType === "__all",
  );
  const [noPermitSubMode, setNoPermitSubMode] = useState<NoPermitSubMode>(
    permitType === "__commuter_all"
      ? "commuter_all"
      : permitType === "__all"
        ? "all"
        : null,
  );

  const [query, setQuery] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const sections = useMemo(
    () => groupPermits(ALL_PERMIT_TYPES, query),
    [query],
  );

  // Secondary permits should only be Commuter, and not on the same campus as primary
  const secondarySections = useMemo(() => {
    if (!selected) return [];
    const primaryCampus = selected.split(" ")[0]; // e.g. "Busch" from "Busch Commuter"
    const validSecondaries = ALL_PERMIT_TYPES.filter(
      (p) => p.includes("Commuter") && !p.startsWith(primaryCampus),
    );
    return groupPermits(validSecondaries, query);
  }, [selected, query]);

  // ── Helpers ────────────────────────────────────────────────────────────

  const selectRealPermit = (p: string) => {
    if (step === 1) {
      setSelected(p);
      setNoPermitExpanded(false);
      setNoPermitSubMode(null);
      setSecondarySelected(null); // Reset secondary if primary changes
    } else {
      setSecondarySelected(p);
    }
  };

  const buildRawValue = (): string | null => {
    if (noPermitSubMode === "commuter_all") return "__commuter_all";
    if (noPermitSubMode === "all") return "__all";
    return selected;
  };

  const isCommuter = selected && selected.includes("Commuter");

  const handleNext = async () => {
    if (step === 1 && isCommuter) {
      setQuery("");
      setStep(2);
    } else {
      await saveAndExit();
    }
  };

  const saveAndExit = async () => {
    const raw = buildRawValue();
    await setPermitPreference(raw);
    await setSecondaryPermitPreference(
      (step === 2 || isCommuter) && !noPermitSubMode ? secondarySelected : null,
    );
    if (isFromProfile) {
      router.back();
    } else {
      router.replace("/(tabs)" as any);
    }
  };

  const skip = () => {
    if (step === 2) {
      // User skips secondary permit
      setSecondarySelected(null);
      saveAndExit();
    } else {
      if (isFromProfile) {
        router.back();
      } else {
        router.replace("/(tabs)" as any);
      }
    }
  };

  const goBackStep = () => {
    setQuery("");
    setStep(1);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const isNoPermitSelected = noPermitSubMode !== null;
  const canConfirm =
    step === 1
      ? (isNoPermitSelected &&
          (noPermitSubMode === "commuter_all" || noPermitSubMode === "all")) ||
        (!isNoPermitSelected && selected !== null)
      : secondarySelected !== null;

  const activeSections = step === 1 ? sections : secondarySections;

  const accent = isDark ? "#dc2626" : "#cc0033";
  const cardBg = isDark ? "rgba(20,20,24,0.75)" : "rgba(245,245,247,0.85)";
  const cardBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const subBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  return (
    <View style={styles.container}>
      <ScarletSpotsBackground />

      {/* Header */}
      <View style={styles.header}>
        {(isFromProfile || step === 2) && (
          <TouchableOpacity
            onPress={step === 2 ? goBackStep : skip}
            style={styles.backButton}
          >
            <IconSymbol name="chevron.left" size={22} color={isDark ? "#a1a1aa" : "#52525b"} />
          </TouchableOpacity>
        )}
        <Animated.View
          style={styles.headerCenter}
          key={`header-${step}`}
          entering={FadeInRight}
          exiting={FadeOutLeft}
        >
          {!isFromProfile && step === 1 && (
            <View style={[styles.iconCircle, { backgroundColor: `${accent}20` }]}>
              <IconSymbol
                name="parkingsign.circle.fill"
                size={40}
                color={accent}
              />
            </View>
          )}
          <Text style={[styles.title, { color: isDark ? "#ffffff" : "#111111" }]}>
            {step === 1 ? "Your Parking Permit" : "Secondary Permit"}
          </Text>
          <Text style={[styles.subtitle, { color: isDark ? "#a1a1aa" : "#71717a" }]}>
            {step === 1
              ? isFromProfile
                ? "Update your permit to filter lots on the map."
                : "Tell us your permit so we only show relevant lots."
              : "Commuters can select an optional secondary campus permit."}
          </Text>
        </Animated.View>
      </View>

      {/* No Permit option (Step 1 only) */}
      {step === 1 && (
        <View style={[styles.noPermitCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <TouchableOpacity
            style={[
              styles.noPermitRow,
              noPermitExpanded && { borderBottomWidth: 1, borderBottomColor: subBorder },
            ]}
            onPress={() => {
              const expanding = !noPermitExpanded;
              setNoPermitExpanded(expanding);
              if (!expanding) {
                setNoPermitSubMode(null);
                if (isNoPermitSelected) setSelected(null);
              } else {
                setSelected(null);
              }
            }}
            activeOpacity={0.8}
          >
            <View style={styles.noPermitLeft}>
              <Text style={styles.noPermitIcon}>🚫</Text>
              <View>
                <Text style={[styles.noPermitTitle, { color: isDark ? "#e4e4e7" : "#111111" }]}>
                  I don&apos;t have a permit
                </Text>
                <Text style={[styles.noPermitSub, { color: isDark ? "#52525b" : "#71717a" }]}>
                  Choose what to show on the map
                </Text>
              </View>
            </View>
            <IconSymbol
              name={noPermitExpanded ? "chevron.up" : "chevron.down"}
              size={16}
              color={isDark ? "#71717a" : "#a1a1aa"}
            />
          </TouchableOpacity>

          {noPermitExpanded && (
            <View style={styles.noPermitOptions}>
              {/* Show All Lots */}
              <TouchableOpacity
                style={[
                  styles.subOption,
                  { borderBottomColor: subBorder },
                  noPermitSubMode === "all" && styles.subOptionActive,
                ]}
                onPress={() =>
                  setNoPermitSubMode((prev) => (prev === "all" ? null : "all"))
                }
                activeOpacity={0.8}
              >
                <View style={styles.subOptionLeft}>
                  <Text style={[styles.subOptionTitle, { color: isDark ? "#d4d4d8" : "#111111" }]}>🗺️ Show all lots</Text>
                  <Text style={[styles.subOptionSub, { color: isDark ? "#52525b" : "#71717a" }]}>
                    Display every parking lot on the map with no filter
                  </Text>
                </View>
                {noPermitSubMode === "all" && (
                  <IconSymbol
                    name="checkmark.circle.fill"
                    size={20}
                    color="#22c55e"
                  />
                )}
              </TouchableOpacity>

              {/* Commuter All */}
              <TouchableOpacity
                style={[
                  styles.subOption,
                  styles.subOptionLast,
                  noPermitSubMode === "commuter_all" && styles.subOptionActive,
                ]}
                onPress={() =>
                  setNoPermitSubMode((prev) =>
                    prev === "commuter_all" ? null : "commuter_all",
                  )
                }
                activeOpacity={0.8}
              >
                <View style={styles.subOptionLeft}>
                  <Text style={[styles.subOptionTitle, { color: isDark ? "#d4d4d8" : "#111111" }]}>
                    🚗 All commuter lots
                  </Text>
                  <Text style={[styles.subOptionSub, { color: isDark ? "#52525b" : "#71717a" }]}>
                    Every lot accessible with any commuter permit across all
                    campuses
                  </Text>
                </View>
                {noPermitSubMode === "commuter_all" && (
                  <IconSymbol
                    name="checkmark.circle.fill"
                    size={20}
                    color="#22c55e"
                  />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Divider */}
      {step === 1 && (
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]} />
          <Text style={[styles.dividerText, { color: isDark ? "#52525b" : "#a1a1aa" }]}>or choose a permit</Text>
          <View style={[styles.dividerLine, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]} />
        </View>
      )}

      {/* Search */}
      <View style={[styles.searchRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <IconSymbol name="magnifyingglass" size={16} color={isDark ? "#52525b" : "#a1a1aa"} />
        <TextInput
          style={[styles.searchInput, { color: isDark ? "#e4e4e7" : "#111111" }]}
          placeholder="Search permits..."
          placeholderTextColor={isDark ? "#52525b" : "#a1a1aa"}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Permit list */}
      <Animated.ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <SectionList
          scrollEnabled={false}
          sections={activeSections}
          keyExtractor={(item) => item}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.sectionHeader, { color: isDark ? "#52525b" : "#a1a1aa" }]}>{title}</Text>
          )}
          renderItem={({ item }) => {
            const isActive =
              step === 1
                ? selected === item && !isNoPermitSelected
                : secondarySelected === item;
            return (
              <TouchableOpacity
                style={[
                  styles.permitRow,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                  isActive && { borderColor: `${accent}80`, backgroundColor: `${accent}12` },
                ]}
                onPress={() => selectRealPermit(item)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.permitLabel,
                    { color: isDark ? "#a1a1aa" : "#52525b" },
                    isActive && { color: isDark ? "#fca5a5" : accent, fontWeight: "500" },
                  ]}
                  numberOfLines={1}
                >
                  {item}
                </Text>
                {isActive && (
                  <IconSymbol name="checkmark" size={14} color={accent} />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: isDark ? "#3f3f46" : "#a1a1aa" }]}>
              No permits match &quot;{query}&quot;
            </Text>
          }
        />
      </Animated.ScrollView>

      {/* Footer actions */}
      <View style={[styles.footer, { borderTopColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)" }]}>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            { backgroundColor: accent, shadowColor: accent },
            !canConfirm && { backgroundColor: isDark ? "#27272a" : "#d4d4d8", shadowOpacity: 0, elevation: 0 },
          ]}
          onPress={handleNext}
          disabled={!canConfirm}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmButtonText}>
            {step === 1 && isCommuter
              ? "Next"
              : isFromProfile
                ? "Save Permit"
                : "Continue"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={skip} style={styles.skipButton}>
          <Text style={[styles.skipText, { color: isDark ? "#52525b" : "#a1a1aa" }]}>
            {step === 2
              ? "Skip (No secondary set)"
              : isFromProfile
                ? "Cancel"
                : "Skip for now"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 60 : 32,
  },

  header: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  backButton: {
    marginBottom: 8,
    padding: 4,
    alignSelf: "flex-start",
  },
  headerCenter: {
    alignItems: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  // No permit card
  noPermitCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  noPermitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  noPermitLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  noPermitIcon: {
    fontSize: 22,
  },
  noPermitTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  noPermitSub: {
    fontSize: 12,
    marginTop: 2,
  },

  // Sub options (inside no permit)
  noPermitOptions: {
    paddingVertical: 4,
  },
  subOption: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  subOptionLast: {
    borderBottomWidth: 0,
  },
  subOptionActive: {
    backgroundColor: "rgba(34, 197, 94, 0.06)",
  },
  subOptionLeft: {
    flex: 1,
    marginRight: 12,
  },
  subOptionTitle: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 2,
  },
  subOptionSub: {
    fontSize: 12,
    lineHeight: 17,
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginVertical: 14,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
  },

  // Search
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 9 : 4,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },

  // Permit list
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 4,
    marginLeft: 4,
  },
  permitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    marginBottom: 2,
    borderWidth: 1,
  },
  permitLabel: {
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 20,
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  confirmButton: {
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  skipButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 14,
  },
});
