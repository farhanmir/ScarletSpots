import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ForecastPoint } from '@/features/home/types/types';
import { getOccupancyColor } from '@/features/home/services/utils';

interface ForecastSlicesProps {
  slices: Record<string, ForecastPoint> | undefined;
}

export default function ForecastSlices({ slices }: ForecastSlicesProps) {
  if (!slices) return null;
  
  return (
    <View style={styles.forecastSlices}>
      {['15m', '30m', '60m'].map((key) => {
        const s = slices[key];
        if (!s) return null;
        return (
          <View key={key} style={styles.sliceItem}>
            <Text style={styles.sliceLabel}>{key}</Text>
            <Text style={[styles.sliceValue, { color: getOccupancyColor(s.expected_occupancy) }]}>
              {s.expected_occupancy}%
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  forecastSlices: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
  },
  sliceItem: {
    alignItems: 'center',
    gap: 2,
  },
  sliceLabel: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '600',
  },
  sliceValue: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
});
