import React, { useState } from 'react';
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
  ScrollView,
  LayoutAnimation,
  UIManager
} from 'react-native';
import { IconSymbol } from './ui/icon-symbol';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

// Enable LayoutAnimation for Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Lot {
  id: string;
  name: string;
  campus: string;
  latitude: number;
  longitude: number;
  capacity: number;
  occupiedCount: number;
  occupancyRate: number;
  isCustom?: boolean;
}

interface User {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
  };
}

interface LotDetailsProps {
  lot: Lot;
  onClose: () => void;
  onPark: (lotId: string) => void;
  isParking: boolean;
  user: any; 
}

export default function LotDetails({ lot, onClose, onPark, isParking, user }: LotDetailsProps) {
  const [expanded, setExpanded] = useState(false);

  // Prevent LayoutAnimation on unmount which causes crashes
  // We only animate the expansion
  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const getOccupancyColor = (rate: number) => {
    if (rate >= 90) return '#ef4444'; // Red
    if (rate >= 70) return '#f59e0b'; // Amber
    return '#10b981'; // Emerald
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
    <Modal
      animationType="fade"
      transparent={true}
      visible={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View style={[styles.container, expanded && styles.containerExpanded]}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={90} tint="systemThickMaterialDark" style={StyleSheet.absoluteFill} />
        )}
        
        {/* Tappable Header Area for Expansion */}
        <TouchableOpacity 
           activeOpacity={1} 
           onPress={toggleExpand}
           style={styles.expandableHeader}
        >
          {/* Handle Bar */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Content */}
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.titleContainer}>
                <Text style={styles.title}>{lot.name}</Text>
                <View style={styles.badgeContainer}>
                  <View style={[styles.badgeDot, { backgroundColor: getOccupancyColor(lot.occupancyRate) }]} />
                  <Text style={styles.badgeText}>{lot.campus} Campus</Text>
                </View>
              </View>
              
              <TouchableOpacity 
                onPress={(e) => {
                  e.stopPropagation();
                  onClose();
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

            <View style={styles.actions}>
              <TouchableOpacity 
                style={[
                  styles.actionButton, 
                  styles.parkButton,
                  (!user || lot.occupancyRate >= 100) && styles.disabledButton
                ]} 
                onPress={(e) => {
                  e.stopPropagation();
                  onPark(lot.id);
                }}
                disabled={isParking || !user || lot.occupancyRate >= 100}
              >
                <IconSymbol name="p.circle.fill" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>
                  {isParking ? 'Starting...' : !user ? 'Login to Park' : 'Start Session'}
                </Text>
              </TouchableOpacity>

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
            
            {/* Hint Text if collapsed */}
            {!expanded && (
              <Text style={styles.tapToExpandHint}>Tap to view rates & rules</Text>
            )}

            {expanded && (
              <ScrollView style={styles.expandedContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionHeader}>Information</Text>
                <Text style={styles.infoText}>
                  Standard Rutgers parking rules apply. This lot is monitored 24/7. 
                  Please ensure you have a valid permit or active session for this specific lot.
                  {'\n\n'}
                  <Text style={{fontWeight: 'bold', color: 'white'}}>Rates:</Text>
                  {'\n'}• 0-2 Hours: $3.00
                  {'\n'}• 2-4 Hours: $5.00
                  {'\n'}• Daily Max: $10.00
                  {'\n\n'}
                  <Text style={{fontWeight: 'bold', color: 'white'}}>Enforcement:</Text>
                  {'\n'}• Mon-Fri: 8am - 8pm
                  {'\n'}• Weekends: Free (unless event)
                </Text>
              </ScrollView>
            )}

            {!user && (
               <Text style={styles.signInHint}>Go to Profile tab to sign in</Text>
            )}
          </View>
        </TouchableOpacity>
      </View>
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
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: height * 0.9,
  },
  containerExpanded: {
    height: height * 0.7,
  },
  expandableHeader: {
    // Make the whole top area part of the touch target
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flex: 1, 
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
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    color: '#d4d4d8',
    fontSize: 13,
    fontWeight: '500',
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
});
