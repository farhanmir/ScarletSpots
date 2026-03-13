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
import { supabase } from '@/lib/supabase';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/ui/icon-symbol';

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
      router.replace('/');
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
      <LinearGradient
        colors={['#09090b', '#18181b', '#450a0a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={{ position: 'absolute', left: 0, top: 0, padding: 8 }}
              onPress={() => router.back()}
            >
              <IconSymbol name="arrow.left" size={24} color="#a1a1aa" />
            </TouchableOpacity>

            <View style={styles.logoContainer}>
              <Image 
                source={require('@/assets/images/scarletspots_logo.png')} 
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>
              Welcome Back
            </Text>
            <Text style={styles.subtitle}>
              Sign in to continue
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
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
              onPress={() => router.push('/auth/forgot-password')}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },

  // --- Logo ---
  header: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  logoContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoIcon: {
    fontSize: 36,
    fontWeight: '900',
    color: 'white',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: 'white',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#a1a1aa', // zinc-400
  },

  // --- Card ---
  card: {
    width: '100%',
    backgroundColor: 'rgba(24, 24, 27, 0.5)', // zinc-900/50
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(39, 39, 42, 1)', // zinc-800
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
    height: 48,
    backgroundColor: '#27272a', // zinc-800
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3f3f46', // zinc-700
    paddingHorizontal: 14,
    color: 'white',
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
    height: 50,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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
    marginTop: 20,
    backgroundColor: 'rgba(39, 39, 42, 0.5)', // zinc-800/50
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3f3f46', // zinc-700
  },
  demoText: {
    fontSize: 12,
    color: '#a1a1aa', // zinc-400
    textAlign: 'center',
  },
  demoBold: {
    fontWeight: '600',
    color: '#d4d4d8', // zinc-300
  },
});
