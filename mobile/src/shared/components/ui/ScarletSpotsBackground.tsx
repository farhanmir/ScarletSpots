import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";

interface Spot {
  id: number;
  top: string;
  left: string;
  size: number;
  opacity: number;
}

/**
 * A shared background component that renders pure OLED black with
 * subtle, random red "scarlet" spots across the screen.
 */
export function ScarletSpotsBackground() {
  const spots = useMemo(() => {
    const newSpots: Spot[] = [];
    const count = 45; // Subtle density
    for (let i = 0; i < count; i++) {
      newSpots.push({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: Math.random() * 6 + 6, // 6px to 12px
        opacity: Math.random() * 0.18 + 0.08, // 0.08 to 0.26
      });
    }
    return newSpots;
  }, []);

  return (
    <View style={styles.container}>
      {spots.map((spot) => (
        <View
          key={spot.id}
          style={[
            styles.spot,
            {
              top: spot.top as any,
              left: spot.left as any,
              width: spot.size,
              height: spot.size,
              borderRadius: spot.size / 2,
              opacity: spot.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#000000",
  },
  spot: {
    position: "absolute",
    backgroundColor: "#dc2626", // Rutgers Scarlet
  },
});
