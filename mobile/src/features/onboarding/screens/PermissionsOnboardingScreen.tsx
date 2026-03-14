import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import { IconSymbol } from '@/shared/components/ui/icon-symbol';
import { LinearGradient } from 'expo-linear-gradient';

// Steps definition
type PermissionStep = 'location' | 'motion' | 'notifications' | 'completed';

export default function PermissionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<PermissionStep>('location');
  const [denied, setDenied] = useState(false);

  // Check initial status on mount
  useEffect(() => {
    checkInitialStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkInitialStatus = async () => {
    // Check location first
    const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
    if (fgStatus === 'granted') {
      const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        setCurrentStep('location');
        return;
      }

      // Pedometer check
      const { status: motionStatus } = await Pedometer.getPermissionsAsync();
      if (motionStatus === 'granted') {
        // Notification check
        const { status: notifStatus } = await Notifications.getPermissionsAsync();
        if (notifStatus === 'granted') {
          // All good, go to tabs
          router.replace('/(tabs)' as any);
          return;
        } else {
          setCurrentStep('notifications');
        }
      } else {
        setCurrentStep('motion');
      }
    } else {
      setCurrentStep('location');
    }
  };

  const nextStep = () => {
    if (currentStep === 'location') setCurrentStep('motion');
    else if (currentStep === 'motion') setCurrentStep('notifications');
    else if (currentStep === 'notifications') finish();
  };

  const finish = () => {
    router.replace('/onboarding/permit' as any);
  };

  const requestPermission = async () => {
    setLoading(true);
    setDenied(false);
    try {
      if (currentStep === 'location') {
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus === 'granted') {
          const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
          if (bgStatus === 'granted') {
            nextStep();
          } else {
            setDenied(true);
          }
        } else {
          setDenied(true);
        }
      } else if (currentStep === 'motion') {
        // Motion involves Pedometer on iOS/Android often
        const { status } = await Pedometer.requestPermissionsAsync();
        if (status === 'granted') {
          nextStep();
        } else {
          // Motion is optional-ish, we can warn and skip or force. 
          // Blueprint says "denied -> app runs with reduced detection confidence"
          // So we allow proceeding even if denied, maybe with an alert?
          Alert.alert(
            "Motion Detection Disabled",
            "Auto-parking detection will be less accurate without motion sensors.",
            [{ text: "OK", onPress: () => nextStep() }]
          );
        }
      } else if (currentStep === 'notifications') {
        await Notifications.requestPermissionsAsync();
        // Always proceed after notifications, granted or not
        finish();
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

  const recheckPermission = async () => {
    // Re-checks current step's permission
    setLoading(true);
    if (currentStep === 'location') {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
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
      case 'location':
        return {
          icon: 'location.fill',
          color: '#dc2626',
          title: 'Enable Location',
          subtitle: 'ScarletSpots needs your location to show nearby parking lots and navigate you to your car. Allow "Always" so we can detect when you park even when the app is closed.'
        };
      case 'motion':
        return {
          icon: 'figure.walk',
          color: '#9333ea', // Purple
          title: 'Enable Motion',
          subtitle: 'We use motion sensors to automatically detect when you park your car and start walking.'
        };
      case 'notifications':
        return {
          icon: 'bell.fill',
          color: '#f59e0b', // Amber
          title: 'Enable Notifications',
          subtitle: 'Get alerts when your parking session is about to expire or when you enter a lot.'
        };
      default:
        return { icon: 'checkmark.circle', color: 'green', title: 'All Set', subtitle: '' };
    }
  };

  const content = renderContent();

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
        /* ── REQUEST UI ── */
        <View style={styles.content}>
          <View style={styles.stepIndicator}>
            <View style={[styles.dot, currentStep === 'location' && styles.activeDot, (currentStep === 'motion' || currentStep === 'notifications') && styles.completedDot]} />
            <View style={[styles.line, (currentStep === 'motion' || currentStep === 'notifications') && styles.completedLine]} />
            <View style={[styles.dot, currentStep === 'motion' && styles.activeDot, currentStep === 'notifications' && styles.completedDot]} />
            <View style={[styles.line, currentStep === 'notifications' && styles.completedLine]} />
            <View style={[styles.dot, currentStep === 'notifications' && styles.activeDot]} />
          </View>

          <View style={[styles.iconCircle, { backgroundColor: `${content.color}20` }]}>
            <IconSymbol name={content.icon as any} size={48} color={content.color} />
          </View>

          <Text style={styles.title}>{content.title}</Text>
          <Text style={styles.subtitle}>{content.subtitle}</Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: content.color, shadowColor: content.color }]}
            onPress={requestPermission}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {currentStep === 'notifications' ? 'Allow & Finish' : 'Allow Access'}
              </Text>
            )}
          </TouchableOpacity>

          {currentStep !== 'location' && (
            <TouchableOpacity onPress={() => currentStep === 'notifications' ? finish() : nextStep()} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* ── DENIED RECOVERY UI (Mostly for Location) ── */
        <View style={styles.content}>
          <View style={[styles.iconCircle, styles.iconCircleDenied]}>
            <IconSymbol name="location.slash.fill" size={48} color="#f87171" />
          </View>

          <Text style={styles.title}>Permission Denied</Text>
          <Text style={styles.subtitle}>
            ScarletSpots can&apos;t function properly without this permission. Please enable it in settings.
          </Text>

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
              <Text style={styles.secondaryButtonText}>I&apos;ve Enabled It</Text>
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
  // Stepper
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3f3f46',
  },
  activeDot: {
    backgroundColor: '#fff',
    transform: [{ scale: 1.2 }],
  },
  completedDot: {
    backgroundColor: '#22c55e',
  },
  line: {
    width: 40,
    height: 2,
    backgroundColor: '#3f3f46',
    marginHorizontal: 4,
  },
  completedLine: {
    backgroundColor: '#22c55e',
  },

  // Icon
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
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

  // Buttons
  primaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
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
  skipButton: {
    marginTop: 20,
    padding: 10,
  },
  skipText: {
    color: '#71717a',
    fontSize: 15,
  }
});
