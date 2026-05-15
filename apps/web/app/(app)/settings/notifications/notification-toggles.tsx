"use client";

import { useState } from "react";
import { Plate } from "@/components/ui/elo-system";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { updateNotificationPreferences } from "@jits/shared/api/mutations";
import type { NotificationPrefs } from "@jits/shared/api/mutations";

interface Props {
  athleteId: string;
  initialPrefs: NotificationPrefs;
}

const TOGGLES: {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
}[] = [
  {
    key: "enable_challenges",
    label: "CHALLENGES",
    description: "New, accepted, declined, and expiring challenges",
  },
  {
    key: "enable_chat",
    label: "CHAT MESSAGES",
    description: "New messages in conversations",
  },
  {
    key: "enable_matches",
    label: "MATCHES",
    description: "Match start notifications",
  },
];

export function NotificationToggles({ athleteId, initialPrefs }: Props) {
  const [prefs, setPrefs] = useState(initialPrefs);

  async function handleToggle(key: keyof NotificationPrefs) {
    const next = !prefs[key];
    setPrefs((prev) => ({ ...prev, [key]: next }));

    const supabase = createClient();
    await updateNotificationPreferences(supabase, athleteId, { [key]: next });
  }

  return (
    <div
      className="flex flex-col"
      style={{ gap: "var(--space-4)" }}
    >
      <Plate style={{ padding: 0 }}>
        {TOGGLES.map(({ key, label, description }, idx) => (
          <div key={key}>
            {idx > 0 && (
              <div
                style={{
                  height: 1,
                  background: "var(--border-hairline-faint)",
                }}
              />
            )}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-3) var(--space-4)",
                cursor: "pointer",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--size-num-xs)",
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "var(--ls-caps-l)",
                    margin: 0,
                    marginBottom: "var(--space-1)",
                    lineHeight: 1.2,
                  }}
                >
                  {label}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--size-body-xs)",
                    color: "var(--text-tertiary)",
                    margin: 0,
                    lineHeight: "var(--lh-base)",
                  }}
                >
                  {description}
                </p>
              </div>
              <Switch
                checked={prefs[key]}
                onCheckedChange={() => handleToggle(key)}
              />
            </label>
          </div>
        ))}
      </Plate>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--size-body-xs)",
          color: "var(--text-tertiary)",
          margin: 0,
          lineHeight: "var(--lh-base)",
        }}
      >
        Changes are saved automatically. You can also manage notifications
        through your device or browser settings.
      </p>
    </div>
  );
}
