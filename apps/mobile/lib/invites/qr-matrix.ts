/**
 * QR matrix for the invite link (contract 6: encodes the https url, never the
 * scheme link). Pure JS (`qrcode-generator`), drawn by `InviteQr` on the
 * existing react-native-svg, so no native module is added.
 */
import qrcode from "qrcode-generator";

export const QR_QUIET_ZONE = 4;

/** The dark modules as one SVG path (1 unit per module), plus the side length including the quiet zone. */
export function qrPath(text: string): { path: string; size: number } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let path = "";
  // One rectangle per horizontal run of dark modules: fewer seams between
  // neighbours when the path is antialiased, and a much shorter path.
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < n && qr.isDark(r, c)) c++;
      path += `M${start + QR_QUIET_ZONE} ${r + QR_QUIET_ZONE}h${c - start}v1h-${c - start}z`;
    }
  }
  return { path, size: n + QR_QUIET_ZONE * 2 };
}
