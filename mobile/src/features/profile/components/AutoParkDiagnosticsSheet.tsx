import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  getStartupDiagnostics,
  type AutoParkLiveSnapshot,
  type StartupDiagnostics,
} from "../../../../modules/parking-magic";
import {
  bootstrapAutoParkDiagnostics,
  clearAutoParkDiagnosticsCache,
  subscribeAutoParkDiagnostics,
} from "@/shared/services/autoParkDiagnostics";
import { GLASS_DARK, type GlassThemePalette } from "@/shared/components/ui/glassTheme";

type Props = {
  visible: boolean;
  onClose: () => void;
  theme: GlassThemePalette;
};

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
}

function Dot({ passed }: Readonly<{ passed: boolean }>) {
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: passed ? "#22c55e" : "#ef4444" },
      ]}
    />
  );
}

function formatCheckDetail(check: AutoParkLiveSnapshot["checks"][number]): string {
  const suffix = check.rawValue ? ` (${check.rawValue})` : "";
  if (check.passed) return `ok${suffix}`;
  return `${check.reasonCode ?? "blocked"}${suffix}`;
}

export default function AutoParkDiagnosticsSheet({
  visible,
  onClose,
  theme,
}: Readonly<Props>) {
  const [latest, setLatest] = useState<AutoParkLiveSnapshot | null>(null);
  const [history, setHistory] = useState<AutoParkLiveSnapshot[]>([]);
  const [startupStatus, setStartupStatus] = useState<StartupDiagnostics | null>(null);

  useEffect(() => {
    if (!visible) return;
    getStartupDiagnostics()
      .then(setStartupStatus)
      .catch(() => {
        setStartupStatus(null);
      });
    bootstrapAutoParkDiagnostics().catch(() => {
      // keep existing cache if bootstrap fails
    });
    return subscribeAutoParkDiagnostics((state) => {
      setLatest(state.latest);
      setHistory(state.history);
    });
  }, [visible]);

  const decisionBanner = useMemo(() => {
    if (!latest) return { text: "No diagnostics yet", bg: "#3f3f46" };
    if (latest.decisionStatus === "started") {
      return { text: "Started session", bg: "#166534" };
    }
    if (latest.decisionStatus === "blocked") {
      return {
        text: `Blocked: ${latest.decisionReasonCode}`,
        bg: "#991b1b",
      };
    }
    return { text: "Ready to auto-start", bg: "#1d4ed8" };
  }, [latest]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            { backgroundColor: theme === GLASS_DARK ? "#141416" : "#ffffff" },
          ]}
        >
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            AutoPark Live Diagnostics
          </Text>
          <View style={[styles.banner, { backgroundColor: decisionBanner.bg }]}>
            <Text style={styles.bannerText}>{decisionBanner.text}</Text>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              Native Startup Status
            </Text>
            <View style={styles.rawGrid}>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Sensing: {startupStatus?.isSensing ? "on" : "off"}
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Permission: {startupStatus?.permissionStatus ?? "n/a"}
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Location services:{" "}
                {startupStatus?.locationServicesEnabled ? "enabled" : "disabled"}
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Motion available:{" "}
                {startupStatus?.motionActivityAvailable ? "yes" : "no"}
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Observers: route={startupStatus?.routeObserverAttached ? "on" : "off"}{" "}
                vulture={startupStatus?.vultureObserverAttached ? "on" : "off"}
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Network configured:{" "}
                {startupStatus?.hasConfiguredNetwork ? "yes" : "no"}
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Pending source: {startupStatus?.pendingEventSource ?? "none"}
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              Raw Data
            </Text>
            <View style={styles.rawGrid}>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Source: {latest?.source ?? "n/a"}
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Speed: {formatNumber(latest?.speedMps)} m/s
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Accuracy: {formatNumber(latest?.horizontalAccuracy)} m
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Location age: {formatNumber(latest?.locationAgeMs, 0)} ms
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Cooldown left: {formatNumber(latest?.cooldownRemainingMs, 0)} ms
              </Text>
              <Text style={[styles.rawLine, { color: theme.textPrimary }]}>
                Lot: {latest?.lotName ?? latest?.lotId ?? "none"}
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              Gate Checks
            </Text>
            {(latest?.checks ?? []).map((check) => (
              <View key={check.key} style={styles.checkRow}>
                <Dot passed={check.passed} />
                <View style={styles.checkBody}>
                  <Text style={[styles.checkLabel, { color: theme.textPrimary }]}>
                    {check.label}
                  </Text>
                  <Text style={[styles.checkMeta, { color: theme.textMuted }]}>
                    {formatCheckDetail(check)}
                  </Text>
                </View>
              </View>
            ))}

            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              Recent Decisions
            </Text>
            {history
              .slice(-10)
              .reverse()
              .map((item) => (
                <View key={`${item.timestamp}-${item.source}`} style={styles.timelineRow}>
                  <Text style={[styles.timelineStatus, { color: theme.textPrimary }]}>
                    {item.decisionStatus.toUpperCase()}
                  </Text>
                  <Text style={[styles.timelineMeta, { color: theme.textMuted }]}>
                    {item.source} - {item.decisionReasonCode}
                  </Text>
                </View>
              ))}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                clearAutoParkDiagnosticsCache().catch(() => {
                  // ignore clear failures
                });
              }}
            >
              <Text style={{ color: "#ef4444", fontWeight: "600" }}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={{ color: theme.accent, fontWeight: "700" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  sheet: {
    borderRadius: 18,
    padding: 14,
    maxHeight: "82%",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  banner: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  bannerText: {
    color: "#fff",
    fontWeight: "700",
  },
  scroll: {
    marginTop: 12,
    maxHeight: Platform.select({ ios: 460, android: 520 }),
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 8,
    letterSpacing: 0.8,
  },
  rawGrid: { gap: 6 },
  rawLine: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 12,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 9,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  checkBody: { flex: 1 },
  checkLabel: { fontSize: 14, fontWeight: "600" },
  checkMeta: { fontSize: 12, marginTop: 1 },
  timelineRow: {
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(120,120,128,0.25)",
  },
  timelineStatus: { fontSize: 11, fontWeight: "800" },
  timelineMeta: { fontSize: 12, marginTop: 2 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  closeButton: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  clearButton: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
});

