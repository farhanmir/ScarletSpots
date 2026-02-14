import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LinearGradient } from 'expo-linear-gradient';

export default function PermissionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  const requestPermission = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        router.replace('/(tabs)');
      } else {
        setDenied(true);
      }
    } catch (error) {
      console.error(error);
      setDenied(true);
    } finally {
      setLoading(false);
    }
  };

  const openSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  // Re-check permission when coming back from settings
  const recheckPermission = async () => {
    setLoading(true);
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') {
      router.replace('/(tabs)');
    } else {
      setDenied(true);
    }
    setLoading(false);
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

      {!denied ? (
        /* ── INITIAL REQUEST ── */
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <IconSymbol name="location.fill" size={48} color="#dc2626" />
          </View>

          <Text style={styles.title}>Enable Location</Text>
          <Text style={styles.subtitle}>
            ScarletSpots needs your location to show nearby parking lots and navigate you to your car.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={requestPermission}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryButtonText}>Allow Location Access</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        /* ── DENIED RECOVERY ── */
        <View style={styles.content}>
          <View style={[styles.iconCircle, styles.iconCircleDenied]}>
            <IconSymbol name="location.slash.fill" size={48} color="#f87171" />
          </View>

          <Text style={styles.title}>Location Denied</Text>
          <Text style={styles.subtitle}>
            You've denied location access. ScarletSpots can't function without it. Please enable it manually in your phone's settings.
          </Text>

          {/* Platform-specific instructions */}
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>
              {Platform.OS === 'ios' ? '📱 iOS Instructions' : '📱 Android Instructions'}
            </Text>

            {Platform.OS === 'ios' ? (
              <View style={styles.steps}>
                <Text style={styles.step}>1. Tap "Open Settings" below</Text>
                <Text style={styles.step}>2. Tap <Text style={styles.bold}>Location</Text></Text>
                <Text style={styles.step}>3. Select <Text style={styles.bold}>While Using the App</Text></Text>
                <Text style={styles.step}>4. Come back here and tap "I've Enabled It"</Text>
              </View>
            ) : (
              <View style={styles.steps}>
                <Text style={styles.step}>1. Tap "Open Settings" below</Text>
                <Text style={styles.step}>2. Tap <Text style={styles.bold}>Permissions</Text></Text>
                <Text style={styles.step}>3. Tap <Text style={styles.bold}>Location</Text></Text>
                <Text style={styles.step}>4. Select <Text style={styles.bold}>Allow only while using the app</Text></Text>
                <Text style={styles.step}>5. Come back here and tap "I've Enabled It"</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={openSettings}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Open Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={recheckPermission}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text style={styles.secondaryButtonText}>I've Enabled It</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },

  // Icon
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircleDenied: {
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
  },

  // Text
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },

  // Instructions card
  instructionsCard: {
    width: '100%',
    backgroundColor: 'rgba(24, 24, 27, 0.6)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(39, 39, 42, 1)',
    marginBottom: 28,
  },
  instructionsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#d4d4d8',
    marginBottom: 14,
  },
  steps: {
    gap: 8,
  },
  step: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
  },
  bold: {
    fontWeight: '700',
    color: '#e4e4e7',
  },

  // Buttons
  primaryButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#dc2626',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.4)',
  },
  secondaryButtonText: {
    color: '#dc2626',
    fontSize: 17,
    fontWeight: '600',
  },
});
