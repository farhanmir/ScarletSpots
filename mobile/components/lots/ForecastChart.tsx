import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { ForecastPoint } from './types';
import { getOccupancyColor, formatTime } from './utils';

interface ForecastChartProps {
  curve: ForecastPoint[];
  isLoading: boolean;
}

export default function ForecastChart({ curve, isLoading }: ForecastChartProps) {
  return (
    <View style={styles.forecastContainer}>
      {isLoading ? (
        <ActivityIndicator size="small" color="#52525b" />
      ) : curve.length > 0 ? (
        curve.map((point: ForecastPoint, index: number) => {
          const isNow = index === 2; // Curve: -60, -30, 0(now), +30, +60, ...
          const barHeight = Math.max(8, (point.expected_occupancy / 100) * 32); 
          const currentTimeLabel = formatTime(point.time);
          
          // Show label if it's "Now", or if it's the first item, or if it changed from previous item
          const showLabel = isNow || index === 0 || (index > 0 && formatTime(curve[index-1].time) !== currentTimeLabel);

          return (
            <View key={index} style={styles.forecastItem}>
              <Text style={[styles.forecastTime, isNow && { color: '#fff', fontWeight: 'bold' }]}>
                {isNow ? 'Now' : (showLabel ? currentTimeLabel : '')}
              </Text>
              <View style={[styles.forecastBar, { height: barHeight, backgroundColor: getOccupancyColor(point.expected_occupancy) }]} />
            </View>
          );
        })
      ) : (
        <Text style={{color: '#71717a'}}>Forecast unavailable</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  forecastContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 60,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  forecastItem: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  forecastBar: {
    width: 8,
    borderRadius: 4,
    backgroundColor: '#3f3f46',
  },
  forecastTime: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '600',
  },
});
