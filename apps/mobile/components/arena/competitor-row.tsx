/**
 * One athlete in the Arena roster.
 *
 * The right-hand slot is the whole design problem. Only an athlete who is
 * present in `lobby:online` can answer a live prompt, so only those rows can
 * carry a Challenge. Every other case gets a specific, honest affordance
 * instead of a greyed-out button that says nothing about why it will not work,
 * and the one that is the athlete's own fault ("you are not live") is a
 * working control, not a label.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Plate, Avatar32, LivePill, MetaTag } from "@/components/ui/elo-system";
import type { ArenaCompetitor } from "@/lib/arena/use-arena-roster";

/** What the row offers on the right. Decided by the screen, never guessed here. */
export type RowAction =
  /** Online, challengeable: the real button. */
  | { kind: "challenge" }
  /** Online, but the viewer is offline. Tapping this takes them live. */
  | { kind: "go-live" }
  /** A challenge is already pending in one direction or the other. */
  | { kind: "pending" }
  /** Listed as looking, but not for ranked. The insert would be refused. */
  | { kind: "casual-only" }
  /** The viewer is at the server's 3 pending outgoing challenge cap. */
  | { kind: "capped" }
  /** Nothing to offer: an offline athlete on the "Open to challenges" list. */
  | { kind: "none" };

interface CompetitorRowProps {
  competitor: ArenaCompetitor;
  inLobby: boolean;
  action: RowAction;
  disabled: boolean;
  onChallenge: () => void;
  onGoLive: () => void;
  onOpenProfile: () => void;
  /** The opponent a match summary's Rematch pointed here: tagged, not recoloured. */
  pinned?: boolean;
}

function Tag({ label }: { label: string }) {
  return <MetaTag>{label}</MetaTag>;
}

export function CompetitorRow({
  competitor,
  inLobby,
  action,
  disabled,
  onChallenge,
  onGoLive,
  onOpenProfile,
  pinned = false,
}: CompetitorRowProps) {
  const { displayName, currentElo, eloDiff, gymName, weight } = competitor;
  const gap = eloDiff > 0 ? `+${eloDiff}` : String(eloDiff);
  const meta = [gymName, weight ? `${weight} lbs` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Plate variant={inLobby ? "live" : "default"} className="px-4 py-3">
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${displayName}, ELO ${currentElo}${pinned ? ", rematch" : ""}`}
          onPress={onOpenProfile}
          className="flex-1 flex-row items-center gap-3"
        >
          <Avatar32
            name={displayName}
            photoUrl={competitor.profilePhotoUrl ?? null}
          />
          <View className="flex-1">
            <Text numberOfLines={1} className="font-heading text-[14px] text-ink">
              {displayName}
            </Text>
            <Text
              className="mt-0.5 font-mono-bold text-[12px] text-ink"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {currentElo}
              {eloDiff !== 0 ? (
                <Text className="font-mono text-[12px] text-ink-2">
                  {`  ${gap} vs you`}
                </Text>
              ) : null}
            </Text>
            {meta ? (
              <Text numberOfLines={1} className="mt-0.5 font-body text-[11px] text-ink-2">
                {meta}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <View className="shrink-0 items-end gap-1">
          {pinned ? <Tag label="Rematch" /> : null}
          {action.kind === "challenge" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Challenge ${displayName}`}
              accessibilityState={{ disabled }}
              onPress={() => {
                // The one tap that sends something to another person gets a
                // light acknowledgement. Feedback only, never fatal.
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => undefined,
                );
                onChallenge();
              }}
              disabled={disabled}
              className="min-h-[44px] justify-center rounded-sm border border-hairline-strong px-3 active:bg-surface-4"
              style={disabled ? { opacity: 0.5 } : undefined}
            >
              <Text className="font-heading text-[11px] text-ink uppercase tracking-caps">
                Challenge
              </Text>
            </Pressable>
          ) : null}

          {action.kind === "go-live" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Go live to challenge ${displayName}`}
              accessibilityState={{ disabled }}
              onPress={onGoLive}
              disabled={disabled}
              className="min-h-[44px] justify-center rounded-sm border border-cta px-3 active:bg-surface-4"
              style={disabled ? { opacity: 0.5 } : undefined}
            >
              <Text className="font-heading text-[11px] text-cta uppercase tracking-caps">
                Go live
              </Text>
            </Pressable>
          ) : null}

          {action.kind === "pending" ? <Tag label="Pending" /> : null}
          {action.kind === "casual-only" ? <Tag label="Casual only" /> : null}
          {action.kind === "capped" ? <Tag label="3 out" /> : null}
          {action.kind === "none" && inLobby ? <LivePill label="In lobby" /> : null}
        </View>
      </View>
    </Plate>
  );
}
