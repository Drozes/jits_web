import * as React from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { qrPath } from "@/lib/invites/qr-matrix";

/**
 * The invite QR: black on white with a 4-module quiet zone in BOTH themes
 * (a dark-mode QR scans badly), so these two colours are deliberately literal.
 */
export function InviteQr({ value, size = 232 }: { value: string; size?: number }) {
  const qr = React.useMemo(() => qrPath(value), [value]);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Invite QR code. Your training partner scans it with their phone camera."
      testID="invite-qr"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${qr.size} ${qr.size}`}>
        <Rect x={0} y={0} width={qr.size} height={qr.size} fill="#FFFFFF" />
        <Path d={qr.path} fill="#000000" />
      </Svg>
    </View>
  );
}
