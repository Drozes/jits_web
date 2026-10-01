import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { challengeStatLine, inviterShortName, joinStatLine } from "./format";
import type { InvitePreview } from "./types";

export const OG_SIZE = { width: 1200, height: 630 };

/** Light theme on purpose: messengers render cards on white chrome. */
const PAPER = "#F8FAFC";
const INK = "#0D0F14";
const MUTED = "#4B5563";
const RED = "#E63946";

const FONT_DIR = path.join(process.cwd(), "lib/invites/fonts");

interface CardLines {
  headline: string;
  stats: string;
  cta: string | null;
  code: string | null;
}

/** Card copy per contract 6. No expiry time: messengers cache per URL. */
export function cardLines(preview: InvitePreview): CardLines {
  if (preview.state !== "open") {
    return { headline: "WHERE DO YOU STAND?", stats: "Jiu-jitsu, rated.", cta: null, code: null };
  }
  const name = inviterShortName(preview.inviter);
  return preview.kind === "challenge"
    ? {
        headline: `${name} CHALLENGES YOU`,
        stats: challengeStatLine(preview.inviter),
        cta: "Tap to accept",
        code: preview.short_code_display,
      }
    : { headline: `JOIN ${name} ON ELO RATED`, stats: joinStatLine(preview.inviter), cta: "Tap to join", code: null };
}

/** Bebas Neue is about 0.42em per glyph: shrink long names to one or two lines. */
function headlineSize(text: string): number {
  return Math.max(72, Math.min(148, Math.floor(2400 / Math.max(text.length, 1))));
}

export async function renderInviteCard(preview: InvitePreview): Promise<ImageResponse> {
  const [bebas, mono] = await Promise.all([
    readFile(path.join(FONT_DIR, "BebasNeue-Regular.ttf")),
    readFile(path.join(FONT_DIR, "JetBrainsMono-Bold.ttf")),
  ]);
  const { headline, stats, cta, code } = cardLines(preview);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, padding: "56px 72px", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 12, height: 44, background: RED }} />
          <div style={{ fontFamily: "Bebas", fontSize: 52, color: INK, letterSpacing: 1 }}>ELO RATED</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ fontFamily: "Bebas", fontSize: headlineSize(headline), color: INK, lineHeight: 0.92 }}>{headline}</div>
          <div style={{ fontFamily: "Mono", fontSize: 34, color: MUTED, marginTop: 28 }}>{stats}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          {cta ? (
            <div style={{ display: "flex", background: RED, color: INK, fontFamily: "Bebas", fontSize: 48, padding: "10px 32px 4px", borderRadius: 4 }}>{cta}</div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
          {code && <div style={{ fontFamily: "Mono", fontSize: 28, color: MUTED }}>{`CODE ${code}`}</div>}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Bebas", data: bebas, weight: 400, style: "normal" },
        { name: "Mono", data: mono, weight: 700, style: "normal" },
      ],
    },
  );
}

/** ImageResponse is PNG; the contract wants a JPEG under 250 KB. */
export async function toJpeg(png: ArrayBuffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(png)).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}
