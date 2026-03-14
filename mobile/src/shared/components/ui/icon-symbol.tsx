// Icon component using MaterialIcons (cross-platform, always available).
// SF Symbol names are mapped to their closest Material Icons equivalents.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];
type MCIIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

type IconDef =
  | { lib: "mi"; name: MaterialIconName }
  | { lib: "mci"; name: MCIIconName };

const MAPPING: Record<string, IconDef> = {
  // Navigation / UI
  "house.fill": { lib: "mi", name: "home" },
  "map.fill": { lib: "mi", name: "map" },
  magnifyingglass: { lib: "mi", name: "search" },
  "paperplane.fill": { lib: "mi", name: "send" },
  "chevron.right": { lib: "mi", name: "chevron-right" },
  "chevron.left": { lib: "mi", name: "chevron-left" },
  "chevron.down": { lib: "mi", name: "expand-more" },
  "chevron.up": { lib: "mi", name: "expand-less" },
  xmark: { lib: "mi", name: "close" },
  "xmark.circle.fill": { lib: "mi", name: "cancel" },
  checkmark: { lib: "mi", name: "check" },
  "checkmark.circle.fill": { lib: "mi", name: "check-circle" },
  "arrow.right": { lib: "mi", name: "arrow-forward" },
  "arrow.left": { lib: "mi", name: "arrow-back" },
  "chevron.left.forwardslash.chevron.right": { lib: "mi", name: "code" },

  // Person / Auth
  "person.fill": { lib: "mi", name: "person" },
  "person.2.fill": { lib: "mi", name: "people" },
  "lock.fill": { lib: "mi", name: "lock" },
  "rectangle.portrait.and.arrow.right": { lib: "mi", name: "logout" },

  // Location
  "mappin.and.ellipse": { lib: "mi", name: "place" },
  "location.north.fill": { lib: "mi", name: "navigation" },
  "location.fill": { lib: "mi", name: "my-location" },
  "location.slash.fill": { lib: "mi", name: "location-off" },

  // Parking
  "car.fill": { lib: "mi", name: "directions-car" },
  "parkingsign.circle.fill": { lib: "mci", name: "parking" },

  // Favorites / Settings
  "star.fill": { lib: "mi", name: "star" },
  star: { lib: "mi", name: "star-border" },
  "gearshape.fill": { lib: "mi", name: "settings" },
  "building.2.fill": { lib: "mi", name: "business" },
  "bell.fill": { lib: "mi", name: "notifications" },
  "trash.fill": { lib: "mi", name: "delete" },
  clock: { lib: "mi", name: "access-time" },

  // Misc
  questionmark: { lib: "mi", name: "help-outline" },
};

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: string;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: string; // accepted but unused (MaterialIcons doesn't have weight)
}) {
  const def = MAPPING[name];
  if (!def) {
    return (
      <MaterialIcons
        color={color}
        size={size}
        name="help-outline"
        style={style}
      />
    );
  }
  if (def.lib === "mci") {
    return (
      <MaterialCommunityIcons
        color={color}
        size={size}
        name={def.name}
        style={style}
      />
    );
  }
  return (
    <MaterialIcons color={color} size={size} name={def.name} style={style} />
  );
}
