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
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={['#000000', '#050505', '#0a0a0a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glowBackdrop} />
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

          <View style={styles.formContainer}>
            <View style={styles.formInner}>
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
                  <ActivityIndicator color="#000" />
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
  glowBackdrop: {
    position: 'absolute',
    top: '-15%',
    right: '-10%',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#ffffff',
    opacity: 0.03, // Barely visible white glow
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 100,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 40,
  },

  header: {
    marginBottom: 44,
    marginTop: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 32,
  },
  backButtonInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
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
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#71717a',
    fontWeight: '500',
    letterSpacing: -0.2,
  },

  // --- Form ---
  formContainer: {
    width: '100%',
  },
  formInner: {
    padding: 0,
  },
  inputGroup: { gap: 10, marginBottom: 24 },
  label: { color: '#a1a1aa', fontSize: 14, fontWeight: '500' },
  input: {
    height: 56,
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 16,
  },
  submitButton: {
    height: 56,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
