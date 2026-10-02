import * as React from "react";
import { ActivityIndicator, BackHandler, Text, TextInput, View } from "react-native";
import { PressableScale } from "@/components/ui/pressable-scale";
import { ChevronLeft, Pencil } from "lucide-react-native";
import { isValidAthleteWeight } from "@jits/shared/api/athlete-weight";
import { ON_MEDIA, usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS, TABULAR } from "../fight/fight-tokens";
import { InitialsBlock, Mono, shortName } from "../fight/fight-ui";
import { useFaceoffContext } from "./faceoff-context";
import { StatePressable } from "@/components/ui/state-pressable";

export interface FaceoffAthlete {
  display_name: string;
  current_elo: number | null;
}

interface FaceoffTopProps {
  phase: "weight" | "ready";
  me: FaceoffAthlete;
  opponent: FaceoffAthlete;
}

/** Dynamic Type cap for the top bar texts, so Leave and the label stay on one line. */
export const TOP_BAR_FONT_CAP = 1.3;
/**
 * Leave's width before it is measured (chevron, gap and "LEAVE" at the font
 * cap), so the first frame already reserves room for it.
 */
const LEAVE_MIN_WIDTH = 88;

function weightText(lbs: number | null): string {
  return lbs != null ? `${Number(lbs.toFixed(1))} LBS` : "-- LBS";
}

/**
 * The face-off header, above the camera: the top bar (Leave, phase)
 * and the fight card. Big on the weigh-in, compressed to the light athlete
 * chip on the ready phase so the camera framing panel fits under it.
 */
export function FaceoffTop({ phase, me, opponent }: FaceoffTopProps) {
  const f = useFaceoffContext();
  const p = usePalette();
  const { canLeave, leave } = f;
  // Leave's laid-out width: both side slots keep at least this much room.
  const [leaveWidth, setLeaveWidth] = React.useState(LEAVE_MIN_WIDTH);

  // Android back is the Leave control here: leaving without cancelling left
  // the match pending with nobody in it (jits-bh2v).
  React.useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canLeave) leave();
      return true;
    });
    return () => sub.remove();
  }, [canLeave, leave]);

  return (
    <View style={{ gap: phase === "weight" ? 20 : 16 }}>
      {/* The label sits between two equal side slots, so it is centred
          whether or not Leave is showing. Each slot is at least as wide as
          Leave (measured), so a narrow screen or a large Dynamic Type size
          ellipsizes the label instead of drawing Leave over it. The Leave
          text never changes width (cancelling swaps the chevron for a
          same-size spinner) and both texts cap their font scale. */}
      <View style={{ height: 44, flexDirection: "row", alignItems: "center" }}>
        <View
          testID="faceoff-top-left"
          style={{ flex: 1, minWidth: leaveWidth, flexDirection: "row", alignItems: "center", justifyContent: "flex-start" }}
        >
          {canLeave ? (
            <View testID="faceoff-leave-measure" onLayout={(e) => setLeaveWidth(Math.ceil(e.nativeEvent.layout.width))}>
              <StatePressable
                testID="faceoff-leave"
                accessibilityRole="button"
                // The harness and screen readers know this control as "Cancel
                // match": it cancels the match for both athletes.
                accessibilityLabel="Cancel match"
                accessibilityState={{ disabled: f.cancelling, busy: f.cancelling }}
                disabled={f.cancelling}
                onPress={leave}
                hitSlop={8}
                style={({ pressed }) => ({ height: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || f.cancelling ? 0.6 : 1 })}
              >
                <View style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
                  {f.cancelling ? (
                    <ActivityIndicator testID="faceoff-leave-spinner" size="small" color={p.text} />
                  ) : (
                    <ChevronLeft size={18} color={p.text} />
                  )}
                </View>
                <Text
                  testID="faceoff-leave-text"
                  numberOfLines={1}
                  maxFontSizeMultiplier={TOP_BAR_FONT_CAP}
                  className="font-heading uppercase"
                  style={{ fontSize: 13, letterSpacing: 1.12, color: p.text }}
                >
                  Leave
                </Text>
              </StatePressable>
            </View>
          ) : null}
        </View>
        <View style={{ flexShrink: 1, minWidth: 0, alignItems: "center" }}>
          <Mono testID="faceoff-top-label" bold color={p.text3} numberOfLines={1} maxFontSizeMultiplier={TOP_BAR_FONT_CAP}>
            {phase === "weight" ? "FACE-OFF · WEIGH IN" : "FACE-OFF · READY"}
          </Mono>
        </View>
        {/* Right slot: empty (no match-kind tag), mirrors the left slot. */}
        <View
          testID="faceoff-top-right"
          style={{ flex: 1, minWidth: leaveWidth, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}
        />
      </View>
      {phase === "weight" ? (
        <FightCard me={me} opponent={opponent} />
      ) : (
        <FaceoffChip me={me} opponent={opponent} myWeight={f.myWeight} opponentWeight={f.opponentWeight} />
      )}
    </View>
  );
}

function FightCard({ me, opponent }: { me: FaceoffAthlete; opponent: FaceoffAthlete }) {
  const f = useFaceoffContext();
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <View style={{ flex: 1, gap: 10, minWidth: 0 }}>
        <InitialsBlock name={me.display_name} size="fill" fontSize={64} display accent={p.cta} style={{ height: 176 }} />
        <Text numberOfLines={1} className="font-heading uppercase" style={{ fontSize: 16, letterSpacing: 0.6, color: p.text }}>
          {shortName(me.display_name)}
        </Text>
        <Mono size={12} spacing={0} color={p.text2}>
          {me.current_elo != null ? `ELO ${me.current_elo}` : "UNRATED"}
        </Mono>
        <MyWeight />
      </View>
      <View style={{ width: 40, height: 176, alignItems: "center", justifyContent: "center" }}>
        <Text className="font-display" style={{ fontSize: 30, color: p.red }}>
          VS
        </Text>
      </View>
      <View style={{ flex: 1, gap: 10, alignItems: "flex-end", minWidth: 0 }}>
        <InitialsBlock name={opponent.display_name} size="fill" fontSize={64} display style={{ height: 176 }} />
        <Text numberOfLines={1} className="font-heading uppercase" style={{ fontSize: 16, letterSpacing: 0.6, color: p.text }}>
          {shortName(opponent.display_name)}
        </Text>
        <Mono size={12} spacing={0} color={p.text2}>
          {opponent.current_elo != null ? `ELO ${opponent.current_elo}` : "UNRATED"}
        </Mono>
        <View style={{ height: 44, justifyContent: "center" }}>
          <Text testID="faceoff-opponent-weight" className="font-display" style={[{ fontSize: 36, color: p.text }, TABULAR]}>
            {weightText(f.opponentWeight)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The viewer's weight for THIS match (the challenge's rated weight) with a
 * pencil. The pencil edits the PROFILE weight, for future matches: this
 * match is rated on the weights stamped on its challenge, so its stakes and
 * weigh-in never change from here, and the editor says so.
 */
function MyWeight() {
  const f = useFaceoffContext();
  const p = usePalette();
  const [text, setText] = React.useState("");
  const editing = f.weightEditorOpen;
  const value = Number(text.replace(",", "."));
  const valid = text.trim() !== "" && isValidAthleteWeight(value);

  if (!editing) {
    return (
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text testID="faceoff-my-weight" className="font-display" style={[{ fontSize: 36, color: p.text }, TABULAR]}>
            {weightText(f.myWeight)}
          </Text>
          {f.myWeighed ? null : (
            <PressableScale
              testID="faceoff-edit-weight"
              accessibilityRole="button"
              accessibilityLabel="Edit your profile weight"
              accessibilityHint="Updates your profile weight for future matches. This match keeps its weigh-in."
              onPress={() => {
                setText(f.profileWeightSaved != null ? String(f.profileWeightSaved) : f.myWeight != null ? String(f.myWeight) : "");
                f.setWeightEditorOpen(true);
              }}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Pencil size={16} color={p.text2} />
            </PressableScale>
          )}
        </View>
        {f.profileWeightSaved != null ? (
          <Text testID="faceoff-profile-weight-saved" className="font-body" style={{ fontSize: 12, color: p.text2 }}>
            {`Profile weight saved: ${Number(f.profileWeightSaved.toFixed(1))} lbs, for future matches.`}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          testID="faceoff-weight-input"
          accessibilityLabel="Your profile weight in pounds"
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          maxLength={5}
          autoFocus
          className="font-mono-bold"
          style={{
            width: 84,
            height: 44,
            paddingHorizontal: 8,
            fontSize: 18,
            color: p.text,
            backgroundColor: p.plate,
            borderWidth: 1,
            borderColor: valid ? p.strong : p.red,
            borderRadius: FIGHT_RADIUS.button,
          }}
        />
        <PressableScale
          testID="faceoff-weight-save"
          accessibilityRole="button"
          accessibilityLabel="Save profile weight"
          accessibilityState={{ disabled: !valid || f.savingWeight }}
          disabled={!valid || f.savingWeight}
          onPress={async () => {
            if (await f.editWeight(value)) f.setWeightEditorOpen(false);
          }}
          style={{ minWidth: 64, height: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", opacity: valid && !f.savingWeight ? 1 : 0.5 }}
        >
          <Text className="font-heading uppercase" style={{ fontSize: 13, letterSpacing: 0.8, color: p.text }}>
            {f.savingWeight ? "Saving" : "Save"}
          </Text>
        </PressableScale>
        <PressableScale
          testID="faceoff-weight-cancel"
          accessibilityRole="button"
          accessibilityLabel="Cancel weight edit"
          onPress={() => f.setWeightEditorOpen(false)}
          style={{ minWidth: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text className="font-heading uppercase" style={{ fontSize: 13, letterSpacing: 0.8, color: p.text2 }}>
            Cancel
          </Text>
        </PressableScale>
      </View>
      <Text testID="faceoff-weight-edit-note" className="font-body" style={{ fontSize: 12, color: p.text2 }}>
        Updates your profile weight for future matches. This match keeps its weigh-in.
      </Text>
    </View>
  );
}

/**
 * The compressed athlete chip on the ready phase and, with `onMedia`, over
 * the camera on the countdown. On the page it is a themed plate; over the
 * camera it is the fixed light chip of the live athlete bar.
 */
export function FaceoffChip({
  me,
  opponent,
  myWeight,
  opponentWeight,
  height = 64,
  onMedia = false,
}: {
  me: FaceoffAthlete;
  opponent: FaceoffAthlete;
  myWeight: number | null;
  opponentWeight: number | null;
  height?: number;
  /** Over the camera (the countdown): the fixed light chip. */
  onMedia?: boolean;
}) {
  const p = usePalette();
  const c = onMedia
    ? { bg: ON_MEDIA.chip, border: ON_MEDIA.chipBorder, ink: ON_MEDIA.ink, ink3: ON_MEDIA.ink3, vs: ON_MEDIA.inkRed, dot: ON_MEDIA.cta }
    : { bg: p.plate, border: p.strong, ink: p.text, ink3: p.text3, vs: p.red, dot: p.cta };
  const meta = (a: FaceoffAthlete, w: number | null) =>
    [a.current_elo != null ? String(a.current_elo) : null, w != null ? `${Number(w.toFixed(1))} LBS` : null]
      .filter(Boolean)
      .join(" · ");
  return (
    <View
      testID="faceoff-chip"
      style={{ height, flexDirection: "row", backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: FIGHT_RADIUS.button }}
    >
      <View style={{ flex: 1, paddingLeft: 12, justifyContent: "center", gap: 5, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <View style={{ width: 4, height: 4, backgroundColor: c.dot }} />
          <Text numberOfLines={1} className="font-heading uppercase" style={{ fontSize: 15, letterSpacing: 0.6, color: c.ink }}>
            {shortName(me.display_name)}
          </Text>
        </View>
        <Text className="font-mono" style={[{ paddingLeft: 11, fontSize: 11, color: c.ink3 }, TABULAR]}>
          {meta(me, myWeight)}
        </Text>
      </View>
      <View style={{ width: 44, alignItems: "center", justifyContent: "center" }}>
        <Text className="font-display" style={{ fontSize: 22, color: c.vs }}>
          VS
        </Text>
      </View>
      <View style={{ flex: 1, paddingRight: 12, justifyContent: "center", alignItems: "flex-end", gap: 5, minWidth: 0 }}>
        <Text numberOfLines={1} className="font-heading uppercase" style={{ fontSize: 15, letterSpacing: 0.6, color: c.ink }}>
          {shortName(opponent.display_name)}
        </Text>
        <Text className="font-mono" style={[{ fontSize: 11, color: c.ink3 }, TABULAR]}>
          {meta(opponent, opponentWeight)}
        </Text>
      </View>
    </View>
  );
}
