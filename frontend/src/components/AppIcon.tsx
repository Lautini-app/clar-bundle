import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../theme";

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: "home-outline",
  cart: "cart-outline",
  book: "book-outline",
  time: "time-outline",
  settings: "settings-outline",
};

type Props = {
  iconName: string;
  color: string;
  size?: number;
  locked?: boolean;
  testID?: string;
};

export default function AppIcon({ iconName, color, size = 56, locked, testID }: Props) {
  const ic = ICON_MAP[iconName] ?? "apps-outline";
  return (
    <View
      testID={testID}
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: radius.md,
          backgroundColor: locked ? colors.divider : color + "22",
          borderColor: locked ? colors.divider : color + "55",
        },
      ]}
    >
      <Ionicons name={ic} size={size * 0.5} color={locked ? colors.inkMuted : color} />
      {locked && (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={10} color={colors.cream} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  lockBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
});
