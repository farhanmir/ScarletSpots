import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { IconSymbol } from './ui/icon-symbol';

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

interface LotDetailsProps {
  lot: Lot;
  onClose: () => void;
  onPark: (lot: Lot) => void;
  isParking: boolean;
  user: any;
}

export default function LotDetails({ lot, onClose, onPark, isParking, user }: LotDetailsProps) {
  const isFull = lot.occupancyRate >= 100;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{lot.name}</Text>
          <Text style={styles.subtitle}>{lot.campus}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <IconSymbol name="chevron.right" size={24} color="#666" style={{ transform: [{ rotate: '90deg' }] }} />
        </TouchableOpacity>
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{lot.capacity}</Text>
          <Text style={styles.statLabel}>Capacity</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{lot.occupiedCount}</Text>
          <Text style={styles.statLabel}>Occupied</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: isFull ? 'red' : 'green' }]}>
            {Math.round(lot.occupancyRate)}%
          </Text>
          <Text style={styles.statLabel}>Full</Text>
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.parkButton, (isFull || !user) && styles.disabledButton]} 
        onPress={() => onPark(lot)}
        disabled={isFull || isParking || !user}
      >
        <Text style={styles.parkButtonText}>
          {isParking ? 'Parking...' : !user ? 'Sign in to Park' : isFull ? 'Lot Full' : 'Park Here'}
        </Text>
      </TouchableOpacity>
      
      {!user && (
         <Text style={styles.signInHint}>Go to Profile tab to sign in</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
  },
  closeButton: {
    padding: 5,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 25,
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  statLabel: {
    fontSize: 12,
    color: '#aaa',
  },
  parkButton: {
    backgroundColor: '#dc2626',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#555',
  },
  parkButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  signInHint: {
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
    fontSize: 12,
  },
});
