import React, { useMemo } from "react";
import { StyleSheet, View, Dimensions } from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

interface Spot {
  id: number;
  top: number;
  left: number;
  size: number;
  opacity: number;
}

/**
 * Full-screen background for the app.
 *
 * Layers (bottom to top):
 *  1. Pure OLED black base.
 *  2. Top-left "celestial" glow (concentric circles simulate radial gradient).
 *  3. Bottom-right glow.
 *  4. Subtle scattered scarlet spot particles.
 */
export function ScarletSpotsBackground() {
  const spots = useMemo<Spot[]>(() => {
    const list: Spot[] = [];
    for (let i = 0; i < 40; i++) {
      list.push({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() * 5 + 4, // 4–9 px
        opacity: Math.random() * 0.14 + 0.06, // 0.06–0.20
      });
    }
    return list;
  }, []);

  return (
    <View style={styles.container}>
      {/* ── Top-left glow blob ─────────────────────────────────────────── */}
      <GlowBlob top={-BLOB * 0.42} left={-BLOB * 0.42} />

      {/* ── Bottom-right glow blob (dimmer) ────────────────────────────── */}
      <GlowBlob bottom={-BLOB * 0.48} right={-BLOB * 0.48} opacity={0.6} />

      {/* ── Scarlet spot particles ──────────────────────────────────────── */}
      {spots.map((spot) => (
        <View
          key={spot.id}
          style={[
            styles.spot,
            {
              top: `${spot.top}%` as any,
              left: `${spot.left}%` as any,
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

// ── GlowBlob ─────────────────────────────────────────────────────────────────
// Simulates a CSS radial-gradient by stacking 4 concentric circles that
// decrease in size but increase in opacity toward the center.

const BLOB = Math.round(Math.max(SCREEN_W, SCREEN_H) * 0.9);

const LAYERS: { scale: number; opacity: number }[] = [
  { scale: 1, opacity: 0.04 },
  { scale: 0.72, opacity: 0.07 },
  { scale: 0.48, opacity: 0.1 },
  { scale: 0.28, opacity: 0.12 },
];

interface GlowBlobProps {
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
  opacity?: number;
}

function GlowBlob({
  top,
  left,
  bottom,
  right,
  opacity = 1,
}: Readonly<GlowBlobProps>) {
  return (
    <View
      style={[
        {
          position: "absolute",
          width: BLOB,
          height: BLOB,
          top,
          left,
          bottom,
          right,
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      {LAYERS.map((layer) => {
        const size = BLOB * layer.scale;
        const offset = (BLOB - size) / 2;
        return (
          <View
            key={layer.scale}
            style={{
              position: "absolute",
              top: offset,
              left: offset,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: `rgba(204, 0, 51, ${layer.opacity})`,
            }}
          />
        );
      })}
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
    overflow: "hidden",
  },
  spot: {
    position: "absolute",
    backgroundColor: "#cc0033",
  },
});
