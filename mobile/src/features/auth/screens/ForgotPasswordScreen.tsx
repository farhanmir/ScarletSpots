import { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  useColorScheme,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { publicApiCall } from "@/shared/api/supabase";

const RESEND_COOLDOWN_S = 60;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme !== "light";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_S);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Missing Email", "Please enter your Rutgers email.");
      return;
    }
    if (
      !trimmed.endsWith("@rutgers.edu") &&
      !trimmed.endsWith("@scarletmail.rutgers.edu")
    ) {
      Alert.alert(
        "Invalid Email",
        "Please enter a valid Rutgers email address (@rutgers.edu or @scarletmail.rutgers.edu).",
      );
      return;
    }

    setLoading(true);
    try {
      await publicApiCall("/users/password-reset", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      setSent(true);
      startCooldown();
    } catch (error: any) {
      Alert.alert(
        "Reset Failed",
        error?.message || "Could not send reset email. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      await publicApiCall("/users/password-reset", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      startCooldown();
      Alert.alert("Sent", "Another reset email has been sent.");
    } catch (error: any) {
      Alert.alert(
        "Failed",
        error?.message || "Could not resend. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const accent = isDark ? "#dc2626" : "#cc0033";
  const resendDisabledBg = isDark ? "#27272a" : "#d4d4d8";

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#09090b" : "#ffffff" }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={isDark ? ["#09090b", "#18181b", "#450a0a"] : ["#ffffff", "#fef7f7", "#fff5f5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: isDark ? "rgba(39,39,42,0.8)" : "rgba(0,0,0,0.06)" }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={isDark ? "#a1a1aa" : "#52525b"} />
        </TouchableOpacity>

        <View style={[styles.iconBox, { backgroundColor: accent, shadowColor: accent }]}>
          <Ionicons name="lock-open-outline" size={40} color="white" />
        </View>

        <Text style={[styles.title, { color: isDark ? "white" : "#111111" }]}>Reset Password</Text>

        <View style={[styles.card, { backgroundColor: isDark ? "rgba(24,24,27,0.5)" : "rgba(245,245,247,0.8)", borderColor: isDark ? "rgba(39,39,42,1)" : "rgba(0,0,0,0.08)" }]}>
          {sent ? (
            <>
              <Ionicons name="mail-open-outline" size={48} color="#22c55e" />
              <Text style={[styles.cardTitle, { color: isDark ? "#d4d4d8" : "#111111" }]}>Check your inbox</Text>
              <Text style={[styles.cardText, { color: isDark ? "#71717a" : "#52525b" }]}>
                A reset link was sent to{"\n"}
                <Text style={{ color: isDark ? "#d4d4d8" : "#111111", fontWeight: "600" }}>
                  {email.trim()}
                </Text>
              </Text>
              <Text style={[styles.cardText, { color: isDark ? "#71717a" : "#52525b", marginTop: 8 }]}>
                Check your spam folder if you don&apos;t see it.
              </Text>

              <TouchableOpacity
                style={[
                  styles.button,
                  {
                    marginTop: 20,
                    backgroundColor: cooldown > 0 ? resendDisabledBg : accent,
                  },
                ]}
                onPress={handleResend}
                disabled={cooldown > 0 || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Email"}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.subtitle, { color: isDark ? "#a1a1aa" : "#71717a" }]}>
                Enter your Rutgers email and we&apos;ll send password reset
                instructions.
              </Text>
              <TextInput
                style={[styles.input, { borderColor: isDark ? "#3f3f46" : "rgba(0,0,0,0.12)", backgroundColor: isDark ? "#27272a" : "rgba(0,0,0,0.04)", color: isDark ? "#fff" : "#111111" }]}
                placeholder="netid@rutgers.edu"
                placeholderTextColor={isDark ? "#71717a" : "#a1a1aa"}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.button, { backgroundColor: accent }, loading && styles.buttonDisabled]}
                onPress={handleSend}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Email</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.secondaryButton, { backgroundColor: isDark ? "#27272a" : "rgba(0,0,0,0.05)", borderColor: isDark ? "#3f3f46" : "rgba(0,0,0,0.1)" }]}
          onPress={() => router.push("/auth/login" as any)}
        >
          <Text style={[styles.secondaryButtonText, { color: isDark ? "#d4d4d8" : "#3f3f46" }]}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(39, 39, 42, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  title: { fontSize: 28, fontWeight: "700", color: "white", marginBottom: 10 },
  subtitle: {
    fontSize: 15,
    color: "#a1a1aa",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  card: {
    width: "100%",
    backgroundColor: "rgba(24, 24, 27, 0.5)",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(39, 39, 42, 1)",
    alignItems: "center",
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#d4d4d8",
    marginTop: 16,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: "#71717a",
    textAlign: "center",
    lineHeight: 20,
  },
  input: {
    width: "100%",
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#27272a",
    color: "#fff",
    paddingHorizontal: 14,
    marginBottom: 14,
    fontSize: 15,
  },
  button: {
    width: "100%",
    height: 50,
    backgroundColor: "#dc2626",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    width: "100%",
    height: 50,
    backgroundColor: "#27272a",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  secondaryButtonText: { color: "#d4d4d8", fontSize: 16, fontWeight: "600" },
});
