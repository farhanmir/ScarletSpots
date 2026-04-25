import React, { useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  useColorScheme,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  FadeInDown,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { GlassBackground } from "@/shared/components/ui/GlassBackground";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";

export default function AuthChoiceScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  const breathScale = useSharedValue(1);

  useEffect(() => {
    breathScale.value = withRepeat(
      withTiming(1.04, {
        duration: 1400,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
  }, [breathScale]);

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#000" : "#ffffff" }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Sweeping background gradient from top-center */}
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={
            isDark
              ? ["#450a0a", "#18181b", "#000000"]
              : ["#fff5f5", "#fef7f7", "#ffffff"]
          }
          start={{ x: 0.5, y: 0.1 }}
          end={{ x: 0.5, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.content}>
        {/* Top / Hero Section */}
        <View style={styles.heroSection}>
          <Animated.View
            entering={FadeInDown.duration(800).delay(100)}
            style={styles.logoContainer}
          >
            {/* The image itself has a built-in background, so we just add a soft shadow */}
            <View style={styles.logoShadow}>
              <Image
                source={require("../../../../assets/images/app-icon.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.duration(800).delay(200)}
            style={[styles.textContainer, breathStyle]}
          >
            <Text style={[styles.appName, { color: isDark ? "#ffffff" : "#111111" }]}>ScarletSpots</Text>
            <Text style={[styles.tagline, { color: isDark ? "#a1a1aa" : "#71717a" }]}>Parking at Rutgers, solved.</Text>
          </Animated.View>
        </View>

        {/* Bottom / Actions Section */}
        <Animated.View
          entering={SlideInDown.duration(800).delay(400)}
          style={styles.actionsContainer}
        >
          <GlassBackground
            style={StyleSheet.absoluteFill}
            glassStyle="regular"
            blurIntensity={30}
          />

          <View style={styles.actionsInner}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: isDark ? "#dc2626" : "#cc0033", shadowColor: isDark ? "#dc2626" : "#cc0033" }]}
              onPress={() => router.push("/auth/sign-up" as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Create Account</Text>
              <IconSymbol name="arrow.right" size={18} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                {
                  backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                  borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                },
              ]}
              onPress={() => router.push("/auth/login" as any)}
              activeOpacity={0.8}
            >
              <Text style={[styles.secondaryButtonText, { color: isDark ? "#e4e4e7" : "#111111" }]}>Sign In</Text>
            </TouchableOpacity>

            <Text style={[styles.termsText, { color: isDark ? "#52525b" : "#71717a" }]}>
              By continuing, you agree to our{" "}
              <Text style={[styles.termsLink, { color: isDark ? "#a1a1aa" : "#52525b" }]}>Terms</Text> &{" "}
              <Text style={[styles.termsLink, { color: isDark ? "#a1a1aa" : "#52525b" }]}>Privacy Policy</Text>.{"\n"}
              <Text style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
                Rutgers students & staff only.
              </Text>
            </Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
  },

  // Hero
  heroSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  logoContainer: {
    marginBottom: 32,
  },
  logoShadow: {
    width: 140,
    height: 140,
    borderRadius: 32,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
    backgroundColor: "transparent",
  },
  logoImage: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
  },
  textContainer: {
    alignItems: "center",
  },
  appName: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 18,
    fontWeight: "500",
  },

  // Actions
  actionsContainer: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  actionsInner: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48, // ample bottom padding for modern notch devices
    gap: 16,
  },
  primaryButton: {
    height: 58,
    backgroundColor: "#dc2626",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  secondaryButton: {
    height: 58,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  termsText: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 16,
    lineHeight: 18,
  },
  termsLink: {
    textDecorationLine: "underline",
  },
});
