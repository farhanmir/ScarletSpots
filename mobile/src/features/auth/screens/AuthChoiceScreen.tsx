import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, Dimensions, StatusBar } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn, SlideInDown } from 'react-native-reanimated';
import { GlassBackground } from '@/shared/components/ui/GlassBackground';
import { IconSymbol } from '@/shared/components/ui/icon-symbol';

const { width, height } = Dimensions.get('window');

export default function AuthChoiceScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      {/* Pure black background with extremely subtle gradient fade up */}
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={['#000000', '#050505', '#0a0a0a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Elegant mesh glow behind logo */}
        <Animated.View entering={FadeIn.duration(1200)} style={styles.glowBackdrop} />
      </View>

      <View style={styles.content}>
        {/* Top / Hero Section */}
        <View style={styles.heroSection}>
          <Animated.View entering={FadeInDown.duration(800).delay(100).springify().damping(20)} style={styles.logoContainer}>
            <View style={styles.logoShadow}>
              <Image
                source={require('../../../../assets/images/scarletspots_logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(800).delay(200).springify().damping(20)} style={styles.textContainer}>
            <Text style={styles.appName}>ScarletSpots</Text>
            <Text style={styles.tagline}>Parking at Rutgers, perfected.</Text>
          </Animated.View>
        </View>

        {/* Bottom / Actions Section */}
        <Animated.View entering={FadeInDown.duration(800).delay(350).springify().damping(20)} style={styles.actionsContainer}>
          <View style={styles.actionsInner}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/auth/sign-up' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Create Account</Text>
              <IconSymbol name="arrow.right" size={16} color="#000" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/auth/login' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Sign In</Text>
            </TouchableOpacity>

            <Text style={styles.termsText}>
              By continuing, you agree to our <Text style={styles.termsLink}>Terms</Text> & <Text style={styles.termsLink}>Privacy</Text>.{'\n'}
              <Text style={{ color: '#52525b' }}>Rutgers students & staff only.</Text>
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
    backgroundColor: '#000',
  },
  glowBackdrop: {
    position: 'absolute',
    top: height * 0.15,
    left: width * 0.1,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: '#ffffff',
    opacity: 0.03, // Barely visible white glow
    transform: [{ scale: 1.2 }],
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 100,
    elevation: 0,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },

  // Hero
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 80,
  },
  logoContainer: {
    marginBottom: 36,
  },
  logoShadow: {
    width: 84,
    height: 84,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
    backgroundColor: '#000', // ensure it doesn't bleed transparently if image misses pixels
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  textContainer: {
    alignItems: 'center',
  },
  appName: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#71717a',
    fontWeight: '500',
    letterSpacing: -0.2,
  },

  // Actions
  actionsContainer: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)', // ultra slight fill
  },
  actionsInner: {
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 56, // ample bottom padding
    gap: 14,
  },
  primaryButton: {
    height: 56,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  secondaryButton: {
    height: 56,
    backgroundColor: 'transparent',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  termsText: {
    textAlign: 'center',
    color: '#52525b',
    fontSize: 12,
    marginTop: 16,
    lineHeight: 18,
  },
  termsLink: {
    color: '#a1a1aa',
    fontWeight: '500',
  },
});
