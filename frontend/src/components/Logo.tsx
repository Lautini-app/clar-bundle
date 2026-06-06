import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme";

type Props = { size?: number; color?: string; testID?: string };

export default function Logo({ size = 56, color = colors.cream, testID }: Props) {
  return (
    <View style={[styles.row, { gap: size * 0.04 }]} testID={testID ?? "clar-logo"}>
      <Text style={{ fontSize: size, fontWeight: "700", letterSpacing: -2, color }}>
        clar
      </Text>
      <View
        style={{
          width: size * 0.18,
          height: size * 0.18,
          borderRadius: size * 0.09,
          backgroundColor: color,
          marginTop: size * 0.35,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
});
