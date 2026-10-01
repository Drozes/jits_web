/**
 * The invite QR matrix carries a 4-module quiet zone on every side.
 * Source: apps/mobile/lib/invites/qr-matrix.ts
 */
import { QR_QUIET_ZONE, qrPath } from "@/lib/invites/qr-matrix";

it("encodes the link with a quiet zone and no module inside the margin", () => {
  const { path, size } = qrPath("https://elorated.com/c/Ab3_dE-fGhIjKlMnOpQrSt");
  expect(size).toBeGreaterThanOrEqual(21 + QR_QUIET_ZONE * 2);
  const starts = [...path.matchAll(/M(\d+) (\d+)h(\d+)/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  expect(starts.length).toBeGreaterThan(0);
  for (const [x, y, w] of starts) {
    expect(x).toBeGreaterThanOrEqual(QR_QUIET_ZONE);
    expect(y).toBeGreaterThanOrEqual(QR_QUIET_ZONE);
    expect(x + w).toBeLessThanOrEqual(size - QR_QUIET_ZONE);
    expect(y + 1).toBeLessThanOrEqual(size - QR_QUIET_ZONE);
  }
});
