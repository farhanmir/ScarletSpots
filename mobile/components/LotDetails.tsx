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
import { type RutgersLot, getPermitLotIds, ALL_COMMUTER_LOT_IDS } from '../data/lots';

import { useQuery } from '@tanstack/react-query';
import { publicApiCall } from '../lib/supabase';
import { ForecastResponse, ForecastPoint } from './lots/types';
import { getOccupancyColor } from './lots/utils';
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
  permitType?: string | null;
}

export default function LotDetails({ lot, onClose, onPark, isParking, user, activeSession, isFavorite, onToggleFavorite, permitType }: LotDetailsProps) {
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
    enabled: !!lot.id && !lot.id.startsWith('custom:') && (lot.capacity ?? 0) > 0,
    staleTime: 60000 * 15,
    retry: 1,
  });

  const forecast: ForecastPoint[] = React.useMemo(() => {
    if (!forecastData) return [];
    if (forecastData.curve && Array.isArray(forecastData.curve)) return forecastData.curve;
    if (Array.isArray(forecastData)) return forecastData as unknown as ForecastPoint[];
    return [];
  }, [forecastData]);

  const slices = forecastData?.slices;

  const permitValidity: boolean | null = React.useMemo(() => {
    if (!permitType) return null;
    if (permitType === '__commuter_all') return ALL_COMMUTER_LOT_IDS.has(lot.id);
    if (permitType.startsWith('__custom:')) {
      const flags = permitType.slice('__custom:'.length).split(',');
      return flags.some(flag => {
        if (flag === 'student')  return lot.student;
        if (flag === 'employee') return lot.employee;
        if (flag === 'gated')    return lot.regularGate || lot.smartGate;
        if (flag === 'ev')       return lot.evCharging > 0;
        return false;
      });
    }
    return getPermitLotIds(permitType).has(lot.id);
  }, [permitType, lot]);

  const handleClose = useCallback(() => {
    if (mountedRef.current) onClose();
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
    if (url) Linking.openURL(url);
  };

  const openSpots = Math.max(0, lot.capacity - lot.occupiedCount);
  const occColor = getOccupancyColor(lot.occupancyRate);
  const isDisabled = !user || lot.occupancyRate >= 100;

  const features = [
    lot.student         && { icon: 'graduationcap.fill', label: 'Student',    color: '#818cf8', bg: 'rgba(99,102,241,0.15)',   border: 'rgba(99,102,241,0.35)' },
    lot.employee        && { icon: 'briefcase.fill',      label: 'Employee',   color: '#34d399', bg: 'rgba(16,185,129,0.12)',   border: 'rgba(16,185,129,0.3)' },
    (lot.regularGate || lot.smartGate) && { icon: 'lock.fill', label: 'Gated', color: '#fbbf24', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' },
    lot.evCharging > 0  && { icon: 'bolt.car.fill',       label: 'EV Charging',color: '#60a5fa', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)' },
    lot.handicapped > 0 && { icon: 'figure.roll',         label: 'Accessible', color: '#c084fc', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)' },
  ].filter(Boolean) as { icon: string; label: string; color: string; bg: string; border: string }[];

  return (
    <Modal visible={true} transparent={true} animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View entering={FadeIn.duration(200)} style={[styles.overlay, StyleSheet.absoluteFill]} />
      </TouchableWithoutFeedback>

      <Animated.View entering={SlideInDown.duration(280)} style={styles.container}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={95} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
        )}

        {/* Handle */}
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Header ── */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {lot.campus ? (
                <View style={styles.campusPill}>
                  <Text style={styles.campusPillText}>{lot.campus} Campus</Text>
                </View>
              ) : null}
              <Text style={styles.lotName}>{lot.name}</Text>
            </View>
            <View style={styles.headerRight}>
              {user && onToggleFavorite && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                  style={styles.iconBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <IconSymbol name={isFavorite ? 'star.fill' : 'star'} size={20} color={isFavorite ? '#f59e0b' : '#71717a'} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); handleClose(); }}
                style={styles.iconBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <IconSymbol name="xmark" size={14} color="#71717a" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Stats row ── */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: occColor }]}>{Math.round(lot.occupancyRate)}%</Text>
              <Text style={styles.statLab}>Full</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{openSpots}</Text>
              <Text style={styles.statLab}>Open Spots</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{lot.capacity}</Text>
              <Text style={styles.statLab}>Capacity</Text>
            </View>
          </View>

          {/* ── Occupancy bar ── */}
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(100, lot.occupancyRate)}%` as any, backgroundColor: occColor }]} />
          </View>

          {/* ── Feature badges ── */}
          {features.length > 0 && (
            <View style={styles.featureRow}>
              {features.map(f => (
                <View key={f.label} style={[styles.featurePill, { backgroundColor: f.bg, borderColor: f.border }]}>
                  <IconSymbol name={f.icon as any} size={11} color={f.color} />
                  <Text style={[styles.featurePillText, { color: f.color }]}>{f.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Permit validity ── */}
          {permitValidity !== null && (
            <View style={[styles.permitRow, permitValidity ? styles.permitRowValid : styles.permitRowInvalid]}>
              <IconSymbol
                name={permitValidity ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                size={16}
                color={permitValidity ? '#4ade80' : '#52525b'}
              />
              <Text style={[styles.permitRowText, { color: permitValidity ? '#4ade80' : '#52525b' }]}>
                {permitValidity ? 'Valid for your permit' : 'Not valid for your permit'}
              </Text>
            </View>
          )}

          {/* ── Forecast slices ── */}
          {slices && (
            <View style={styles.slicesSection}>
              <Text style={styles.sectionTitle}>FORECAST</Text>
              <View style={styles.slicesRow}>
                {['15m', '30m', '60m'].map(key => {
                  const s = slices[key];
                  if (!s) return null;
                  const c = getOccupancyColor(s.expected_occupancy);
                  return (
                    <View key={key} style={styles.sliceCard}>
                      <Text style={styles.sliceTime}>{key}</Text>
                      <Text style={[styles.sliceVal, { color: c }]}>{s.expected_occupancy}%</Text>
                      <View style={[styles.sliceDot, { backgroundColor: c }]} />
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Forecast chart ── */}
          <ForecastChart curve={forecast} isLoading={isLoadingForecast} />

          {/* ── Actions ── */}
          <View style={styles.actionsRow}>
            {!activeSession && (
              <TouchableOpacity
                style={[styles.parkBtn, isDisabled && styles.parkBtnDisabled]}
                onPress={(e) => {
                  e.stopPropagation();
                  if (user && lot.occupancyRate < 100) {
                    Alert.alert(
                      'Confirm Parking',
                      `Start a session at ${lot.name}?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Park Here', style: 'default', onPress: () => onPark(lot.id) },
                      ]
                    );
                  }
                }}
                disabled={isParking || isDisabled}
                activeOpacity={0.8}
              >
                <IconSymbol name="p.circle.fill" size={20} color="#fff" />
                <Text style={styles.parkBtnText}>{renderActionText()}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.dirBtn, !activeSession && { flex: 0, paddingHorizontal: 20 }]}
              onPress={(e) => { e.stopPropagation(); openDirections(); }}
              activeOpacity={0.8}
            >
              <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={18} color="#60a5fa" />
              {!!activeSession && <Text style={styles.dirBtnText}>Directions</Text>}
            </TouchableOpacity>
          </View>

          {!user && (
            <Text style={styles.signInNote}>Sign in from the Profile tab to log parking sessions</Text>
          )}

          <View style={{ height: 36 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Platform.OS === 'android' ? '#111113' : 'transparent',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: height * 0.90,
    // thin top border for visual depth
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 38, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2 },

  scroll: { width: '100%' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4 },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 12,
  },
  headerLeft: { flex: 1, gap: 6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
  campusPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.25)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  campusPillText: { color: '#f87171', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  lotName: { fontSize: 24, fontWeight: '700', color: '#fafafa', letterSpacing: -0.3, lineHeight: 30 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  statVal: { fontSize: 22, fontWeight: '800', color: '#f4f4f5', fontVariant: ['tabular-nums'] },
  statLab: { fontSize: 12, color: '#71717a', fontWeight: '500' },

  // Occupancy bar
  barTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    marginBottom: 20,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },

  // Feature badges
  featureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  featurePillText: { fontSize: 12, fontWeight: '700' },

  // Permit row
  permitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
  },
  permitRowValid: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderColor: 'rgba(34,197,94,0.25)',
  },
  permitRowInvalid: {
    backgroundColor: 'rgba(113,113,122,0.08)',
    borderColor: 'rgba(113,113,122,0.15)',
  },
  permitRowText: { fontSize: 13, fontWeight: '700' },

  // Slices
  slicesSection: { marginBottom: 16 },
  sectionTitle: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  slicesRow: { flexDirection: 'row', gap: 10 },
  sliceCard: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 4,
  },
  sliceTime: { color: '#52525b', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  sliceVal: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] as any },
  sliceDot: { width: 5, height: 5, borderRadius: 2.5 },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  parkBtn: {
    flex: 1,
    height: 54,
    borderRadius: 17,
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  parkBtnDisabled: {
    backgroundColor: '#27272a',
    shadowOpacity: 0,
    elevation: 0,
  },
  parkBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  dirBtn: {
    flex: 1,
    height: 54,
    borderRadius: 17,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dirBtnText: { color: '#60a5fa', fontWeight: '600', fontSize: 16 },

  signInNote: {
    color: '#3f3f46',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 4,
  },
});
