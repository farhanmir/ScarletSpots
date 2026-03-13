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
} from 'react-native';
import { publicApiCall, supabase } from '@/shared/api/supabase';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/shared/components/ui/icon-symbol';
import { GlassBackground } from '@/shared/components/ui/GlassBackground';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!email || !password || !name || !confirmPassword) return 'Please fill in all fields';
    if (password !== confirmPassword) return 'Passwords do not match';
    if (password.length < 6) return 'Password must be at least 6 characters';
    if (!email.endsWith('@rutgers.edu') && !email.endsWith('@scarletmail.rutgers.edu')) {
      return 'Please use a valid Rutgers email address';
    }
    return null;
  };

  const handleSignUp = async () => {
    const errorMsg = validate();
    if (errorMsg) {
      Alert.alert('Invalid Input', errorMsg);
      return;
    }

    setLoading(true);
    try {
      // 1. Call Signup FastAPI endpoint
      const response = await publicApiCall('/users/signup', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          name,
        }),
      });

      if (response.success) {
        // Auto sign in
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Success -> Go to permissions or tabs
        router.replace('/onboarding/permissions' as any); // Blueprint says Success -> Permissions Intro
      } else {
        throw new Error(response.error || 'Signup failed');
      }

    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
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
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join the ScarletSpots community</Text>
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
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Scarlet Knight"
                  placeholderTextColor="#52525b"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Rutgers Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="netid@rutgers.edu"
                  placeholderTextColor="#52525b"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Min 6 characters"
                  placeholderTextColor="#52525b"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter password"
                  placeholderTextColor="#52525b"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSignUp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.submitButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>
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
    paddingRight: 2,
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
    gap: 20,
  },
  inputGroup: { gap: 8 },
  label: { color: '#d4d4d8', fontSize: 14, fontWeight: '500' },
  input: {
    height: 54,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 16,
  },
  submitButton: {
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
  submitButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
