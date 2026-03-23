import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Linking,
  ActivityIndicator,
  Alert,
  AppState,
  useColorScheme,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Pedometer } from "expo-sensors";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import { LinearGradient } from "expo-linear-gradient";

// Steps definition
type PermissionStep = "location" | "motion" | "notifications" | "completed";

function hasPreciseLocation(
  fgPermission: Location.LocationPermissionResponse,
): boolean {
  if (Platform.OS === "ios") {
    // iOS 14+ exposes full vs reduced precision.
    return fgPermission.ios?.accuracy === "full";
  }
  if (Platform.OS === "android") {
    // Android reports fine/coarse/none precision.
    return fgPermission.android?.accuracy === "fine";
  }
  return true;
}

async function getStrictLocationState() {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  const precise = hasPreciseLocation(fg);
  const fgGranted = fg.status === "granted";
  const bgGranted = bg.status === "granted";
  const fullyGranted = fgGranted && bgGranted && precise;
  const canAskAgain = Boolean(fg.canAskAgain || bg.canAskAgain);

  return {
    fg,
    bg,
    precise,
    fgGranted,
    bgGranted,
    fullyGranted,
    canAskAgain,
  };
}

function getLocationRecoverySteps(platformOS: string): string[] {
  if (platformOS === "ios") {
    return [
      "In Settings > Location, set access to Always.",
      "Turn on Precise Location.",
    ];
  }

  return [
    "In Settings > Permissions > Location, choose Allow all the time.",
    "Set location accuracy to Precise.",
  ];
}

function getLocationRecoveryPlatformLabel(platformOS: string): string {
  return platformOS === "ios" ? "iOS" : "Android";
}

export default function PermissionsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<PermissionStep>("location");
  const [denied, setDenied] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  // Check initial status on mount and whenever the app returns from Settings.
  useEffect(() => {
    checkInitialStatus();

    const sub = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current !== "active" && nextState === "active") {
        checkInitialStatus();
      }
      appStateRef.current = nextState;
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkInitialStatus = async () => {
    // Check location first
    const locationState = await getStrictLocationState();
    if (locationState.fullyGranted) {

      // Pedometer check
      const { status: motionStatus } = await Pedometer.getPermissionsAsync();
      if (motionStatus === "granted") {
        // Notification check
        const { status: notifStatus } =
          await Notifications.getPermissionsAsync();
        if (notifStatus === "granted") {
          // All good, go to tabs
          router.replace("/(tabs)" as any);
          return;
        } else {
          setCurrentStep("notifications");
        }
      } else {
        setCurrentStep("motion");
      }
    } else {
      setCurrentStep("location");
      setDenied(!locationState.canAskAgain);
    }
  };

  const nextStep = () => {
    if (currentStep === "location") setCurrentStep("motion");
    else if (currentStep === "motion") setCurrentStep("notifications");
    else if (currentStep === "notifications") finish();
  };

  const finish = () => {
    router.replace("/onboarding/permit" as any);
  };

  const requestLocationPermission = async () => {
    let locationState = await getStrictLocationState();

    if (!locationState.fgGranted && locationState.fg.canAskAgain) {
      await Location.requestForegroundPermissionsAsync();
      locationState = await getStrictLocationState();
    }

    if (locationState.fgGranted && !locationState.bgGranted) {
      if (locationState.bg.canAskAgain) {
        await Location.requestBackgroundPermissionsAsync();
        locationState = await getStrictLocationState();
      }
    }

    if (locationState.fullyGranted) {
      nextStep();
      return;
    }

    setDenied(true);
  };

  const requestMotionPermission = async () => {
    // Motion involves Pedometer on iOS/Android often.
    const { status } = await Pedometer.requestPermissionsAsync();
    if (status === "granted") {
      nextStep();
      return;
    }

    // Blueprint says denied motion still allows continuing with reduced confidence.
    Alert.alert(
      "Motion Detection Disabled",
      "Auto-parking detection will be less accurate without motion sensors.",
      [{ text: "OK", onPress: () => nextStep() }],
    );
  };

  const requestNotificationPermission = async () => {
    await Notifications.requestPermissionsAsync();
    // Always proceed after notifications, granted or not.
    finish();
  };

  const requestPermission = async () => {
    setLoading(true);
    setDenied(false);
    try {
      switch (currentStep) {
        case "location":
          await requestLocationPermission();
          break;
        case "motion":
          await requestMotionPermission();
          break;
        case "notifications":
          await requestNotificationPermission();
          break;
        default:
          break;
      }
    } catch (error) {
      console.error(error);
      setDenied(true);
    } finally {
      setLoading(false);
    }
  };

  const openSettings = () => {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:");
    } else {
      Linking.openSettings();
    }
  };

  const recheckPermission = async () => {
    // Re-checks current step's permission
    setLoading(true);
    if (currentStep === "location") {
      const locationState = await getStrictLocationState();
      if (locationState.fullyGranted) {
        setDenied(false);
        nextStep();
      } else {
        setDenied(true);
      }
    }
    // Motion and Notifs usually don't need a "recheck" from denied state as critically as location
    // But we can add logic if needed. For now, Location is the main blocker.
    setLoading(false);
  };

  const renderContent = () => {
    switch (currentStep) {
      case "location":
        return {
          icon: "location.fill",
          color: "#dc2626",
          title: "Enable Precise Always Location",
          subtitle:
            'ScarletSpots needs precise location access set to "Always" to auto-start and auto-stop parking sessions even when the app is closed.',
        };
      case "motion":
        return {
          icon: "figure.walk",
          color: "#9333ea", // Purple
          title: "Enable Motion",
          subtitle:
            "We use motion sensors to automatically detect when you park your car and start walking.",
        };
      case "notifications":
        return {
          icon: "bell.fill",
          color: "#f59e0b", // Amber
          title: "Enable Notifications",
          subtitle:
            "Get alerts when your parking session is about to expire or when you enter a lot.",
        };
      default:
        return {
          icon: "checkmark.circle",
          color: "green",
          title: "All Set",
          subtitle: "",
        };
    }
  };

  const content = renderContent();
  const locationRecoverySteps = getLocationRecoverySteps(Platform.OS);
  const recoveryPlatformLabel = getLocationRecoveryPlatformLabel(Platform.OS);

  const accent = isDark ? "#dc2626" : "#cc0033";

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#09090b" : "#ffffff" }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={isDark ? ["#09090b", "#18181b", "#450a0a"] : ["#ffffff", "#fef7f7", "#fff5f5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {denied ? (
        /* ── DENIED RECOVERY UI (Mostly for Location) ── */
        <View style={styles.content}>
          <View style={[styles.iconCircle, { backgroundColor: "rgba(248,113,113,0.12)" }]}>
            <IconSymbol name="location.slash.fill" size={48} color="#f87171" />
          </View>

          <Text style={[styles.title, { color: isDark ? "white" : "#111111" }]}>Permission Denied</Text>
          <Text style={[styles.subtitle, { color: isDark ? "#a1a1aa" : "#71717a" }]}>
            ScarletSpots needs Precise + Always Location for background parking
            detection. Please enable it in Settings, then return and tap
            I&apos;ve Enabled It.
          </Text>

          <View style={[styles.hintList, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]}>
            <View style={styles.hintBadge}>
              <Text style={styles.hintBadgeText}>{recoveryPlatformLabel}</Text>
            </View>
            {locationRecoverySteps.map((step) => (
              <Text key={step} style={[styles.hintItem, { color: isDark ? "#d4d4d8" : "#3f3f46" }]}>
                • {step}
              </Text>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accent, shadowColor: accent }]}
            onPress={openSettings}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Open Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: isDark ? "rgba(220,38,38,0.4)" : "rgba(204,0,51,0.35)" }]}
            onPress={recheckPermission}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={accent} />
            ) : (
              <Text style={[styles.secondaryButtonText, { color: accent }]}>
                I&apos;ve Enabled It
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        /* ── REQUEST UI ── */
        <View style={styles.content}>
          <View style={styles.stepIndicator}>
            <View
              style={[
                styles.dot,
                { backgroundColor: isDark ? "#3f3f46" : "#d4d4d8" },
                currentStep === "location" && { backgroundColor: isDark ? "#fff" : "#111111", transform: [{ scale: 1.2 }] },
                (currentStep === "motion" || currentStep === "notifications") && { backgroundColor: "#22c55e" },
              ]}
            />
            <View
              style={[
                styles.line,
                { backgroundColor: isDark ? "#3f3f46" : "#d4d4d8" },
                (currentStep === "motion" || currentStep === "notifications") && { backgroundColor: "#22c55e" },
              ]}
            />
            <View
              style={[
                styles.dot,
                { backgroundColor: isDark ? "#3f3f46" : "#d4d4d8" },
                currentStep === "motion" && { backgroundColor: isDark ? "#fff" : "#111111", transform: [{ scale: 1.2 }] },
                currentStep === "notifications" && { backgroundColor: "#22c55e" },
              ]}
            />
            <View
              style={[
                styles.line,
                { backgroundColor: isDark ? "#3f3f46" : "#d4d4d8" },
                currentStep === "notifications" && { backgroundColor: "#22c55e" },
              ]}
            />
            <View
              style={[
                styles.dot,
                { backgroundColor: isDark ? "#3f3f46" : "#d4d4d8" },
                currentStep === "notifications" && { backgroundColor: isDark ? "#fff" : "#111111", transform: [{ scale: 1.2 }] },
              ]}
            />
          </View>

          <View
            style={[
              styles.iconCircle,
              { backgroundColor: `${content.color}20` },
            ]}
          >
            <IconSymbol
              name={content.icon as any}
              size={48}
              color={content.color}
            />
          </View>

          <Text style={[styles.title, { color: isDark ? "white" : "#111111" }]}>{content.title}</Text>
          <Text style={[styles.subtitle, { color: isDark ? "#a1a1aa" : "#71717a" }]}>{content.subtitle}</Text>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: content.color, shadowColor: content.color },
            ]}
            onPress={requestPermission}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {currentStep === "notifications"
                  ? "Allow & Finish"
                  : "Allow Access"}
              </Text>
            )}
          </TouchableOpacity>

          {currentStep !== "location" && (
            <TouchableOpacity
              onPress={() =>
                currentStep === "notifications" ? finish() : nextStep()
              }
              style={styles.skipButton}
            >
              <Text style={[styles.skipText, { color: isDark ? "#71717a" : "#a1a1aa" }]}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  // Stepper
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#3f3f46",
  },
  activeDot: {
    backgroundColor: "#fff",
    transform: [{ scale: 1.2 }],
  },
  completedDot: {
    backgroundColor: "#22c55e",
  },
  line: {
    width: 40,
    height: 2,
    backgroundColor: "#3f3f46",
    marginHorizontal: 4,
  },
  completedLine: {
    backgroundColor: "#22c55e",
  },

  // Icon
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 28,
  },
  iconCircleDenied: {
    backgroundColor: "rgba(248, 113, 113, 0.1)",
  },

  // Text
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "white",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#a1a1aa",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 14,
  },
  hintList: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  hintBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(220,38,38,0.2)",
    borderColor: "rgba(220,38,38,0.5)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  hintBadgeText: {
    color: "#fca5a5",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  hintItem: {
    color: "#d4d4d8",
    fontSize: 14,
    lineHeight: 20,
  },

  // Buttons
  primaryButton: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 17,
    fontWeight: "600",
  },
  secondaryButton: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.4)",
  },
  secondaryButtonText: {
    color: "#dc2626",
    fontSize: 17,
    fontWeight: "600",
  },
  skipButton: {
    marginTop: 20,
    padding: 10,
  },
  skipText: {
    color: "#71717a",
    fontSize: 15,
  },
});
