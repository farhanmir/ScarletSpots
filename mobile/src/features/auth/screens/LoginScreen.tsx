import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { supabase } from '@/shared/api/supabase';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/shared/components/ui/icon-symbol';
import { GlassBackground } from '@/shared/components/ui/GlassBackground';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const validateForm = (): string | null => {
    if (!email || !password) {
      return 'Please fill in all fields';
    }
    return null;
  };

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  async function handleAuth() {
    const validationError = validateForm();
    if (validationError) {
      Alert.alert('Error', validationError);
      return;
    }

    setLoading(true);
    try {
      await signIn();
      // Ensure we redirect to root which handles permissions
      router.replace('/' as any);
    } catch (error: any) {
      Alert.alert('Authentication Failed', error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Gradient background */}
      {/* Sweeping background gradient from top-center */}
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={['#450a0a', '#18181b', '#000000']}
          start={{ x: 0.5, y: 0.1 }}
          end={{ x: 0.5, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
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
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Sign in to continue</Text>
            </View>
          </View>

          {/* Form Card */}
          <View style={styles.cardContainer}>
            <GlassBackground
              style={StyleSheet.absoluteFill}
              glassStyle="regular"
              blurIntensity={30}
              blurTint="dark"
              fallbackColor="rgba(24,24,27,0.8)"
            />
            <View style={styles.cardInner}>
              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Rutgers Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="netid@rutgers.edu"
                  placeholderTextColor="#71717a"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#71717a"
                  secureTextEntry={true}
                  value={password}
                  onChangeText={setPassword}
                />
              </View>

              {/* Forgot Password */}
              <TouchableOpacity
                style={styles.forgotButton}
                onPress={() => router.push('/auth/forgot-password' as any)}
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>

              {/* Submit */}
              <TouchableOpacity
                style={styles.button}
                onPress={handleAuth}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.buttonText}>
                    Sign In
                  </Text>
                )}
              </TouchableOpacity>

              {/* Demo hint */}
              <View style={styles.demoBox}>
                <Text style={styles.demoText}>
                  <Text style={styles.demoBold}>Tip: </Text>
                  Use your NetID or ScarletMail credentials.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 40,
  },

  // --- Header ---
  header: {
    marginBottom: 40,
    marginTop: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 24,
  },
  backButtonInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 2, // optical center for chevron
  },
  headerTextWrap: {
    marginLeft: 4,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#a1a1aa',
    fontWeight: '500',
  },

  // --- Card ---
  cardContainer: {
    width: '100%',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  cardInner: {
    padding: 32,
  },

  // --- Fields ---
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#d4d4d8', // zinc-300
    marginBottom: 8,
  },
  input: {
    height: 54,
    backgroundColor: 'rgba(0,0,0,0.2)', // Darker input field inside the glass card
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    color: '#71717a', // zinc-500
    marginTop: 6,
  },

  // --- Forgot Password ---
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 8,
    marginTop: -8,
  },
  forgotText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '500',
  },

  // --- Button ---
  button: {
    height: 56,
    backgroundColor: '#dc2626',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // --- Switch ---
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  switchText: {
    fontSize: 14,
    color: '#a1a1aa', // zinc-400
  },
  switchLink: {
    fontSize: 14,
    color: '#ef4444', // red-500
    fontWeight: '600',
  },

  // --- Demo ---
  demoBox: {
    marginTop: 24,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  demoText: {
    fontSize: 13,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 18,
  },
  demoBold: {
    fontWeight: '700',
    color: '#e4e4e7',
  },
});
