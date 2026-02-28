import React, { useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Platform,
  Linking,
  Modal,
  TouchableWithoutFeedback,
  Alert,
  ScrollView,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { IconSymbol } from './ui/icon-symbol';
import { BlurView } from 'expo-blur';
import { type RutgersLot } from '../data/lots';

import { useQuery } from '@tanstack/react-query';
import { publicApiCall } from '../lib/supabase';
import { ForecastResponse, ForecastPoint } from './lots/types';
import OccupancyBadge from './lots/OccupancyBadge';
import ForecastSlices from './lots/ForecastSlices';
import ForecastChart from './lots/ForecastChart';

const { height } = Dimensions.get('window');

type Lot = RutgersLot;

interface LotDetailsProps {
  lot: Lot;
  onClose: () => void;
  onPark: (lotId: string) => void;
  isParking: boolean;
  user: any; 
  activeSession?: any;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export default function LotDetails({ lot, onClose, onPark, isParking, user, activeSession, isFavorite, onToggleFavorite }: LotDetailsProps) {
  // Track whether this component is still mounted so async callbacks never
  // call setState / onClose after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const { data: forecastData, isLoading: isLoadingForecast } = useQuery<ForecastResponse>({
    queryKey: ['forecast', lot.id, lot.capacity],
    queryFn: async () => {
      const data = await publicApiCall(
        `/lots/${lot.id}/forecast?capacity=${lot.capacity}&current_occupancy=${lot.occupiedCount}`
      );
      return data || {};
    },
    enabled: !!lot.id && !lot.id.startsWith('custom:'),
    staleTime: 60000 * 15, // 15 minutes
    retry: 1,              // Only retry once — a 404 won't fix itself
  });

  // If the forecast query errored, show a graceful fallback instead of
  // destructively removing the lot from the cache. Removing the lot caused
  // a crash loop: the lot reappeared on the next poll, the cached error fired
  // the effect immediately on remount, and the lot was removed again.
  // The lot data (occupancy, name, polygon) is independent of the forecast
  // endpoint — a forecast 404 does NOT mean the lot itself was deleted.

  // Extract the curve for the chart — handle both old (array) and new ({slices, curve}) format
  const forecast: ForecastPoint[] = React.useMemo(() => {
    if (!forecastData) return [];
    // New format: { slices, curve }
    if (forecastData.curve && Array.isArray(forecastData.curve)) {
      return forecastData.curve;
    }
    // Old format or raw array fallback
    if (Array.isArray(forecastData)) {
      return forecastData as unknown as ForecastPoint[];
    }
    return [];
  }, [forecastData]);

  // Quick-glance slices (15m, 30m, 60m)
  const slices = forecastData?.slices;

  const handleClose = useCallback(() => {
    if (mountedRef.current) {
      onClose();
    }
  }, [onClose]);

  const renderActionText = () => {
    if (!user) return 'Sign in to Park';
    if (activeSession && activeSession.lotId === lot.id) return 'Parked Here';
    if (activeSession) return 'End Current Session First';
    if (lot.occupancyRate >= 100) return 'Lot Full';
    if (isParking) return 'Confirming...';
    return 'Park Here';
  };

  const openDirections = () => {
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${lot.latitude},${lot.longitude}`;
    const label = lot.name;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`
    });
    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <Modal visible={true} transparent={true} animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View 
          entering={FadeIn.duration(200)}
          style={[styles.overlay, StyleSheet.absoluteFill]} 
        />
      </TouchableWithoutFeedback>

      <Animated.View 
        entering={SlideInDown.duration(250)}
        style={styles.container}
      >
        {Platform.OS === 'ios' && (
          <BlurView intensity={90} tint="systemThickMaterialDark" style={StyleSheet.absoluteFill} />
        )}
        
        {/* Handle Bar */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{lot.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <OccupancyBadge rate={lot.occupancyRate} campus={lot.campus} />
                {user && onToggleFavorite && (
                  <TouchableOpacity 
                    onPress={(e) => {
                      e.stopPropagation();
                      onToggleFavorite();
                    }}
                    style={styles.favoriteButton}
                  >
                    <IconSymbol 
                      name={isFavorite ? "star.fill" : "star"} 
                      size={18} 
                      color={isFavorite ? "#f59e0b" : "#52525b"} 
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            
            <TouchableOpacity 
              onPress={(e) => {
                e.stopPropagation();
                handleClose();
              }} 
              style={styles.closeButton}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <IconSymbol name="xmark.circle.fill" size={30} color="#52525b" />
            </TouchableOpacity>
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{Math.round(lot.occupancyRate)}%</Text>
              <Text style={styles.statLabel}>Occupancy</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{Math.max(0, lot.capacity - lot.occupiedCount)}</Text>
              <Text style={styles.statLabel}>Open Spots</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{lot.capacity}</Text>
              <Text style={styles.statLabel}>Total Cap</Text>
            </View>
          </View>

          <ForecastSlices slices={slices} />
          <ForecastChart curve={forecast} isLoading={isLoadingForecast} />

          <View style={styles.actions}>
            {!activeSession && (
              <TouchableOpacity 
                style={[
                  styles.actionButton, 
                  styles.parkButton,
                  (!user || lot.occupancyRate >= 100) && styles.disabledButton
                ]} 
                onPress={(e) => {
                  e.stopPropagation();
                  if (user && lot.occupancyRate < 100) {
                     Alert.alert(
                      'Confirm Parking',
                      `Start a session at ${lot.name}?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'Park Here', 
                          style: 'default',
                          onPress: () => onPark(lot.id) 
                        }
                      ]
                    );
                  }
                }}
                disabled={isParking || !user || lot.occupancyRate >= 100}
              >
                <IconSymbol name="p.circle.fill" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>
                  {renderActionText()}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.actionButton, styles.directionsButton]} 
              onPress={(e) => {
                e.stopPropagation();
                openDirections();
              }}
            >
              <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={20} color="#3b82f6" />
              <Text style={[styles.actionButtonText, styles.directionsText]}>Directions</Text>
            </TouchableOpacity>
          </View>

          {!user && (
             <Text style={styles.signInHint}>Go to Profile tab to sign in</Text>
          )}

          {/* Spacer to ensure content isn't flush with the bottom on small screens */}
          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Platform.OS === 'android' ? '#18181b' : 'transparent',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: height * 0.90,
  },
  handleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
  },
  scrollView: {
    width: '100%',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: '60%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  parkButton: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  directionsButton: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  disabledButton: {
    backgroundColor: '#3f3f46',
    shadowOpacity: 0,
    opacity: 0.8,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  directionsText: {
    color: '#60a5fa',
  },
  expandedContent: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    flex: 1,
  },
  sectionHeader: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoText: {
    color: '#d4d4d8',
    fontSize: 14,
    lineHeight: 22,
  },
  signInHint: {
    color: '#71717a',
    textAlign: 'center',
    marginTop: 16,
    fontSize: 12,
  },
  tapToExpandHint: {
    color: '#52525b',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 12,
    fontWeight: '500',
  },
  favoriteButton: {
    padding: 4,
  },
});
