import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  ScrollView,
} from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { Stack, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";
import { GlassBackground } from "@/shared/components/ui/GlassBackground";

export default function SignUpScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={["#450a0a", "#18181b", "#000000"]}
          start={{ x: 0.5, y: 0.1 }}
          end={{ x: 0.5, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.content}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <View style={styles.backButtonInner}>
                <IconSymbol name="chevron.left" size={20} color="#e4e4e7" />
              </View>
            </TouchableOpacity>

            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Get Started</Text>
              <Text style={styles.subtitle}>
                Create your ScarletSpots account
              </Text>
            </View>
          </View>

          <View style={styles.cardContainer}>
            <GlassBackground
              style={StyleSheet.absoluteFill}
              glassStyle="regular"
              blurIntensity={30}
              blurTint="dark"
              fallbackColor="rgba(24,24,27,0.8)"
            />
            <View style={styles.cardInner}>
              <Text style={styles.description}>
                ScarletSpots now uses a unified secure login system. You can
                create your account by selecting "Register" on the next screen.
              </Text>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => signIn()}
              >
                <Text style={styles.submitButtonText}>Continue to Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
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
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 80 : 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 40,
    marginTop: 20,
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: 24,
  },
  backButtonInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    paddingRight: 2,
  },
  headerTextWrap: {
    marginLeft: 4,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#a1a1aa",
    fontWeight: "500",
  },
  cardContainer: {
    width: "100%",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  cardInner: {
    padding: 32,
    gap: 20,
  },
  description: {
    color: "#d4d4d8",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 8,
  },
  submitButton: {
    height: 56,
    backgroundColor: "#dc2626",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  submitButtonText: {
    color: "white",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
