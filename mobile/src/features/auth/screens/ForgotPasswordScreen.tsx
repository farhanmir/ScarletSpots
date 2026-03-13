import { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/shared/api/supabase';

const RESEND_COOLDOWN_S = 60;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_S);
    timerRef.current = setInterval(() => {
      setCooldown(prev => {
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
      Alert.alert('Missing Email', 'Please enter your Rutgers email.');
      return;
    }
    if (!trimmed.endsWith('@rutgers.edu') && !trimmed.endsWith('@scarletmail.rutgers.edu')) {
      Alert.alert('Invalid Email', 'Please enter a valid Rutgers email address (@rutgers.edu or @scarletmail.rutgers.edu).');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
      if (error) throw error;
      setSent(true);
      startCooldown();
    } catch (error: any) {
      Alert.alert('Reset Failed', error?.message || 'Could not send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
      if (error) throw error;
      startCooldown();
      Alert.alert('Sent', 'Another reset email has been sent.');
    } catch (error: any) {
      Alert.alert('Failed', error?.message || 'Could not resend. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={['#09090b', '#18181b', '#450a0a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#a1a1aa" />
        </TouchableOpacity>

        <View style={styles.iconBox}>
          <Ionicons name="lock-open-outline" size={40} color="white" />
        </View>

        <Text style={styles.title}>Reset Password</Text>

        <View style={styles.card}>
          {sent ? (
            <>
              <Ionicons name="mail-open-outline" size={48} color="#22c55e" />
              <Text style={styles.cardTitle}>Check your inbox</Text>
              <Text style={styles.cardText}>
                A reset link was sent to{'\n'}<Text style={{ color: '#d4d4d8', fontWeight: '600' }}>{email.trim()}</Text>
              </Text>
              <Text style={[styles.cardText, { marginTop: 8 }]}>
                Check your spam folder if you don&apos;t see it.
              </Text>

              <TouchableOpacity
                style={[styles.button, { marginTop: 20, backgroundColor: cooldown > 0 ? '#27272a' : '#dc2626' }]}
                onPress={handleResend}
                disabled={cooldown > 0 || loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonText}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Email'}
                  </Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>
                Enter your Rutgers email and we&apos;ll send password reset instructions.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="netid@rutgers.edu"
                placeholderTextColor="#71717a"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSend}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonText}>Send Reset Email</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/auth/login' as any)}>
          <Text style={styles.secondaryButtonText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(39, 39, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  title: { fontSize: 28, fontWeight: '700', color: 'white', marginBottom: 10 },
  subtitle: {
    fontSize: 15,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(24, 24, 27, 0.5)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(39, 39, 42, 1)',
    alignItems: 'center',
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#d4d4d8',
    marginTop: 16,
    marginBottom: 8,
  },
  cardText: { fontSize: 14, color: '#71717a', textAlign: 'center', lineHeight: 20 },
  input: {
    width: '100%',
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3f3f46',
    backgroundColor: '#27272a',
    color: '#fff',
    paddingHorizontal: 14,
    marginBottom: 14,
    fontSize: 15,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#27272a',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  secondaryButtonText: { color: '#d4d4d8', fontSize: 16, fontWeight: '600' },
});
