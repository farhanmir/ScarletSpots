/**
 * ParkingConfirmationSheet — Reanimated bottom sheet for auto-detected parking.
 *
 * All animations run on the UI thread via react-native-reanimated worklets:
 *  • Spring slide-up from below the screen on mount
 *  • Pan gesture for swipe-to-dismiss (dismiss threshold: 80 px drag)
 *  • Button press scale feedback (0.95 spring on begin, 1.0 spring on release)
 *
 * Platform notes:
 *  • iOS: BlurView frosted glass + haptic feedback
 *  • Android: Solid dark surface, Material elevation
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Platform, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/shared/components/ui/icon-symbol';
import type { ParkingCandidate } from '@/shared/services/ParkingDetectionService';
import { GlassBackground } from '@/shared/components/ui/GlassBackground';

const SCREEN_H = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 80;

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  candidates: ParkingCandidate[];
  onConfirm: (candidate: ParkingCandidate) => void;
  onDismiss: () => void;
  isLoading?: boolean;
}

// ── Helper: Animated pressable button ─────────────────────────────────────────

interface PressButtonProps {
  onPress: () => void;
  style: object;
  disabled?: boolean;
  children: React.ReactNode;
}

function PressButton({ onPress, style, disabled = false, children }: PressButtonProps) {
  const scale = useSharedValue(1);

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      scale.value = withSpring(0.95, { damping: 20, stiffness: 400 });
    })
    .onEnd(() => {
      // onEnd only fires when the tap succeeds — NOT when the gesture is
      // cancelled (e.g. by the parent pan-to-dismiss). Using onFinalize here
      // would call onPress even on cancelled taps, triggering onConfirm while
      // pendingCandidates is already cleared → crash.
      runOnJS(onPress)();
    })
    .onFinalize(() => {
      // Always reset scale, regardless of success or cancellation
      scale.value = withSpring(1, { damping: 20, stiffness: 400 });
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.6 : 1,
  }));

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}

// ── Confidence helpers ─────────────────────────────────────────────────────────

function getConfidenceColor(c: number): string {
  if (c >= 0.8) return '#10b981';
  if (c >= 0.6) return '#f59e0b';
  return '#ef4444';
}

function getConfidenceLabel(c: number): string {
  if (c >= 0.8) return 'High';
  if (c >= 0.6) return 'Medium';
  return 'Low';
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ParkingConfirmationSheet({
  candidates,
  onConfirm,
  onDismiss,
  isLoading = false,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Slide-up entrance: starts off-screen, springs into view
  const translateY = useSharedValue(SCREEN_H);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (candidates.length > 0) {
      translateY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 1 });
      backdropOpacity.value = withTiming(1, { duration: 300 });
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [candidates.length, translateY, backdropOpacity]);

  // Pan gesture for swipe-to-dismiss
  const panStartY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      panStartY.value = translateY.value;
    })
    .onUpdate(e => {
      // Runs on UI thread — directly track finger position without bridge lag
      const next = panStartY.value + e.translationY;
      translateY.value = Math.max(next, 0);
    })
    .onEnd(e => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(SCREEN_H, { duration: 240 });
        backdropOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(onDismiss)(); // Crosses to JS thread once — triggers state update
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      }
    });

  // ── Animated styles (UI thread) ────────────────────────────────────────────

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (candidates.length === 0) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.container, sheetStyle]}>
        <GlassBackground
          style={StyleSheet.absoluteFill}
          glassStyle="regular"
          blurIntensity={100}
          blurTint="systemThickMaterialDark"
          fallbackColor="rgba(12,12,15,0.95)"
        />
        <View style={styles.content}>
          {/* Drag handle */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <IconSymbol name="car.fill" size={20} color="#ef4444" />
              <Text style={styles.title}>Parking Detected</Text>
            </View>
            <Text style={styles.subtitle}>
              We think you just parked. Confirm your spot below.
            </Text>
          </View>

          {/* Candidate list */}
          <View style={styles.candidateList}>
            {candidates.map((candidate, index) => {
              const isSelected = index === selectedIndex;
              const color = getConfidenceColor(candidate.confidence);

              return (
                <PressButton
                  key={candidate.lotId}
                  style={[
                    styles.candidateRow,
                    isSelected && styles.candidateRowSelected,
                    isSelected && { borderColor: color },
                  ]}
                  onPress={() => {
                    setSelectedIndex(index);
                    if (Platform.OS === 'ios') Haptics.selectionAsync();
                  }}
                >
                  <View style={styles.candidateInfo}>
                    <Text style={styles.candidateName}>{candidate.lotName}</Text>
                    <View style={styles.confidenceBadge}>
                      <View style={[styles.confidenceDot, { backgroundColor: color }]} />
                      <Text style={[styles.confidenceText, { color }]}>
                        {getConfidenceLabel(candidate.confidence)} ({Math.round(candidate.confidence * 100)}%)
                      </Text>
                    </View>
                  </View>
                  {isSelected && (
                    <IconSymbol name="checkmark.circle.fill" size={24} color={color} />
                  )}
                </PressButton>
              );
            })}
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <PressButton style={styles.dismissButton} onPress={onDismiss}>
              <Text style={styles.dismissText}>Not Now</Text>
            </PressButton>

            <PressButton
              style={styles.confirmButton}
              onPress={() => onConfirm(candidates[selectedIndex])}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmText}>Confirm Parking</Text>
              )}
            </PressButton>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  content: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    backgroundColor: 'transparent',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    color: '#fafafa',
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: '#a1a1aa',
    fontSize: 14,
    textAlign: 'center',
  },
  candidateList: {
    gap: 8,
    marginBottom: 20,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  candidateRowSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1.5,
  },
  candidateInfo: {
    flex: 1,
  },
  candidateName: {
    color: '#fafafa',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  dismissButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dismissText: {
    color: '#a1a1aa',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#dc2626',
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
