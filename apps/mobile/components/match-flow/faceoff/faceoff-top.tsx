import * as React from "react";
import { ActivityIndicator, BackHandler, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { PressableScale } from "@/components/ui/pressable-scale";
import { ChevronLeft, Pencil } from "lucide-react-native";
import { isValidAthleteWeight } from "@jits/shared/api/athlete-weight";
import { ON_MEDIA, usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS, TABULAR } from "../fight/fight-tokens";
import { TRACKING, typeSize, typeStep } from "@/lib/typography";
import { InitialsBlock, Mono, shortName } from "../fight/fight-ui";
import { useFaceoffContext } from "./faceoff-context";
import { TimeoutChip } from "./timeout-chip";
import { TimekeeperOfflineBanner } from "../live/timekeeper-offline-banner";
import { StatePressable } from "@/components/ui/state-pressable";
import type { MatchAthleteView } from "@/lib/match-flow/match-roles";

export type FaceoffAthlete = Pick<MatchAthleteView, "displayName" | "currentElo">;

/**
 * A face-off athlete with their id, as the step renderer hands the body its
 * two athletes (no stakes are read since A11 and O1). Kept apart from
 * `FaceoffAthlete`, which the countdown and live stage share without an id.
 */
export type FaceoffParticipant = Pick<MatchAthleteView, "athleteId" | "displayName" | "currentElo">;

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

/** A weight as the face-off writes it: `170.2 LBS`, or `-- LBS` with none (also the timekeeper's rows). */
export function weightText(lbs: number | null): string {
  return lbs != null ? `${Number(lbs.toFixed(1))} LBS` : "-- LBS";
}

/**
 * Android back is the face-off's Leave, and never pops the match screen:
 * leaving without cancelling left the match pending with nobody in it
 * (jits-bh2v), and a timekeeper who left that way left both athletes waiting
 * on a Start nobody would tap until the face-off timed out.
 */
export function useLeaveOnBack(canLeave: boolean, leave: () => void) {
  React.useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canLeave) leave();
      return true;
    });
    return () => sub.remove();
  }, [canLeave, leave]);
}

/**
 * The face-off header, above the camera: the top bar (Leave, phase)
 * and the fight card. Big on the weigh-in, compressed to the light athlete
 * chip on the ready phase so the camera framing panel fits under it. In
 * timekeeper mode an athlete also sees the face-off timeout (TK-D9) under
 * the bar, from the seat, and under it TK-D7 while the server reads the
 * seated timekeeper offline (spec 4.3 "Seated, before start").
 */
export function FaceoffTop({ phase, me, opponent }: FaceoffTopProps) {
  const f = useFaceoffContext();
  const { canLeave, leave } = f;
  useLeaveOnBack(canLeave, leave);

  return (
    <View style={{ gap: phase === "weight" ? 20 : 16 }}>
      <FaceoffTopBar
        label={phase === "weight" ? "FACE-OFF · WEIGH IN" : "FACE-OFF · READY"}
        leave={
          canLeave ? (
            <LeaveButton
              testID="faceoff-leave"
              accessibilityRole="button"
              // The harness and screen readers know this control as "Cancel
              // match": it cancels the match for both athletes.
              accessibilityLabel="Cancel match"
              cancelling={f.cancelling}
              onPress={leave}
            />
          ) : null
        }
      />
      {f.timekeeper ? <TimeoutChip timeoutAt={f.timekeeper.timeoutAt} /> : null}
      {/* TK-D7 before the start, with no chip of its own: TK-D9 above already counts down (spec 4.3). */}
      {f.timekeeper?.offlineName != null ? <TimekeeperOfflineBanner name={f.timekeeper.offlineName} tone="themed" /> : null}
      {phase === "weight" ? (
        <FightCard me={me} opponent={opponent} />
      ) : (
        <FaceoffChip
          me={me}
          opponent={opponent}
          myWeight={f.myWeight}
          opponentWeight={f.opponentWeight}
          // Timekeeper mode only: a two-athlete match keeps its ready plates in the body (jits-o47s.45).
          readiness={f.timekeeper ? { me: f.myReady, opponent: f.opponentReady } : undefined}
        />
      )}
    </View>
  );
}

/**
 * The face-off's top bar: Leave on the left (when offered), the label in the
 * middle. Also the timekeeper's face-off header (`faceoff-timekeeper.tsx`,
 * TK-K0), whose Leave is its own policy's.
 */
export function FaceoffTopBar({
  label,
  leave,
  labelTestID = "faceoff-top-label",
}: {
  label: string;
  /** The `LeaveButton`, or null to hide Leave (once the match is starting, or no Leave is offered). */
  leave: React.ReactNode;
  /** The label's testID (the athletes' `faceoff-top-label` by default). */
  labelTestID?: string;
}) {
  const p = usePalette();
  // Leave's laid-out width: both side slots keep at least this much room.
  const [leaveWidth, setLeaveWidth] = React.useState(LEAVE_MIN_WIDTH);
  return (
    // The label sits between two equal side slots, so it is centred
    // whether or not Leave is showing. Each slot is at least as wide as
    // Leave (measured), so a narrow screen or a large Dynamic Type size
    // ellipsizes the label instead of drawing Leave over it.
    <View style={{ height: 44, flexDirection: "row", alignItems: "center" }}>
      <View
        testID="faceoff-top-left"
        style={{ flex: 1, minWidth: leaveWidth, flexDirection: "row", alignItems: "center", justifyContent: "flex-start" }}
      >
        {leave ? (
          <View testID="faceoff-leave-measure" onLayout={(e) => setLeaveWidth(Math.ceil(e.nativeEvent.layout.width))}>
            {leave}
          </View>
        ) : null}
      </View>
      <View style={{ flexShrink: 1, minWidth: 0, alignItems: "center" }}>
        <Mono testID={labelTestID} bold color={p.text3} numberOfLines={1} maxFontSizeMultiplier={TOP_BAR_FONT_CAP}>
          {label}
        </Mono>
      </View>
      {/* Right slot: empty (no match-kind tag), mirrors the left slot. */}
      <View
        testID="faceoff-top-right"
        style={{ flex: 1, minWidth: leaveWidth, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}
      />
    </View>
  );
}

/**
 * The top bar's Leave: a chevron and `Leave`. What it does, and its identity
 * for the harness and screen readers (testID, role, label), are the
 * caller's: the athletes' cancel above, the timekeeper's seat in
 * `faceoff-timekeeper.tsx`. The text never changes width (cancelling swaps
 * the chevron for a same-size spinner) and caps its font scale.
 */
export function LeaveButton({
  testID,
  accessibilityRole,
  accessibilityLabel,
  cancelling,
  onPress,
}: {
  testID: string;
  accessibilityRole: "button";
  accessibilityLabel: string;
  cancelling: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <StatePressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: cancelling, busy: cancelling }}
      disabled={cancelling}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ height: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || cancelling ? 0.6 : 1 })}
    >
      <View style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
        {cancelling ? (
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
        style={[typeStep("body"), { letterSpacing: TRACKING.caps, color: p.text }]}
      >
        Leave
      </Text>
    </StatePressable>
  );
}

function FightCard({ me, opponent }: { me: FaceoffAthlete; opponent: FaceoffAthlete }) {
  const f = useFaceoffContext();
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <View style={{ flex: 1, gap: 10, minWidth: 0 }}>
        <InitialsBlock name={me.displayName} size="fill" fontSize="display-64" display accent={p.cta} style={{ height: 176 }} />
        <Text numberOfLines={1} className="font-heading uppercase" style={[typeStep("subhead"), { letterSpacing: TRACKING.loose, color: p.text }]}>
          {shortName(me.displayName)}
        </Text>
        <Mono size="small" spacing="normal" color={p.text2}>
          {me.currentElo != null ? `ELO ${me.currentElo}` : "UNRATED"}
        </Mono>
        <MyWeight />
      </View>
      <View style={{ width: 40, height: 176, alignItems: "center", justifyContent: "center" }}>
        <Text className="font-display" style={[typeStep("headline-2xl"), { color: p.red }]}>
          VS
        </Text>
      </View>
      <View style={{ flex: 1, gap: 10, alignItems: "flex-end", minWidth: 0 }}>
        <InitialsBlock name={opponent.displayName} size="fill" fontSize="display-64" display style={{ height: 176 }} />
        <Text numberOfLines={1} className="font-heading uppercase" style={[typeStep("subhead"), { letterSpacing: TRACKING.loose, color: p.text }]}>
          {shortName(opponent.displayName)}
        </Text>
        <Mono size="small" spacing="normal" color={p.text2}>
          {opponent.currentElo != null ? `ELO ${opponent.currentElo}` : "UNRATED"}
        </Mono>
        <View style={{ height: 44, justifyContent: "center" }}>
          <Text testID="faceoff-opponent-weight" className="font-display" style={[typeSize("display-36"), { color: p.text }, TABULAR]}>
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
          <Text testID="faceoff-my-weight" className="font-display" style={[typeSize("display-36"), { color: p.text }, TABULAR]}>
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
          <Text testID="faceoff-profile-weight-saved" className="font-body" style={[typeStep("small"), { color: p.text2 }]}>
            {"Profile weight saved: "}
            {/* The weight is the point of the line: mono, tabular (R3 MF-3). */}
            <Text testID="faceoff-profile-weight-saved-value" className="font-mono" style={TABULAR}>
              {String(Number(f.profileWeightSaved.toFixed(1)))}
            </Text>
            {" lbs, for future matches."}
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
            ...typeSize("title"),
            ...TABULAR,
            color: p.text,
            backgroundColor: p.plate,
            borderWidth: 1,
            borderColor: valid ? p.strong : p.loss,
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
          <Text className="font-heading uppercase" style={[typeStep("body"), { letterSpacing: TRACKING.caps, color: p.text }]}>
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
          <Text className="font-heading uppercase" style={[typeStep("body"), { letterSpacing: TRACKING.caps, color: p.text2 }]}>
            Cancel
          </Text>
        </PressableScale>
      </View>
      <Text testID="faceoff-weight-edit-note" className="font-body" style={[typeStep("small"), { color: p.text2 }]}>
        Updates your profile weight for future matches. This match keeps its weigh-in.
      </Text>
    </View>
  );
}

/**
 * The compressed athlete chip on the ready phase and, with `onMedia`, over
 * the camera on the countdown. On the page it is a themed plate; over the
 * camera it is the fixed light chip of the live athlete bar. With
 * `readiness` (the ready phase, timekeeper mode) each side also says whether
 * that athlete is ready, as plain status text under its rating and weight
 * (jits-o47s.45: the old dashed boxes below read as buttons).
 */
export function FaceoffChip({
  me,
  opponent,
  myWeight,
  opponentWeight,
  height = 64,
  onMedia = false,
  readiness,
}: {
  me: FaceoffAthlete;
  opponent: FaceoffAthlete;
  myWeight: number | null;
  opponentWeight: number | null;
  height?: number;
  /** Over the camera (the countdown): the fixed light chip. */
  onMedia?: boolean;
  /** Each side's ready state, on the page only (the ready phase). The chip grows to fit the status line. */
  readiness?: { me: boolean; opponent: boolean };
}) {
  const p = usePalette();
  const c = onMedia
    ? { bg: ON_MEDIA.chip, border: ON_MEDIA.chipBorder, ink: ON_MEDIA.ink, ink3: ON_MEDIA.ink3, vs: ON_MEDIA.inkRed, dot: ON_MEDIA.cta }
    : { bg: p.plate, border: p.strong, ink: p.text, ink3: p.text3, vs: p.red, dot: p.cta };
  const meta = (a: FaceoffAthlete, w: number | null) =>
    [a.currentElo != null ? String(a.currentElo) : null, w != null ? `${Number(w.toFixed(1))} LBS` : null]
      .filter(Boolean)
      .join(" · ");
  return (
    <View
      testID="faceoff-chip"
      style={{
        ...(readiness ? { minHeight: height, paddingVertical: 10 } : { height }),
        flexDirection: "row",
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: FIGHT_RADIUS.button,
      }}
    >
      <View style={{ flex: 1, paddingLeft: 12, justifyContent: "center", gap: 5, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <View style={{ width: 4, height: 4, backgroundColor: c.dot }} />
          <Text numberOfLines={1} className="font-heading uppercase" style={[typeStep("subhead"), { letterSpacing: TRACKING.loose, color: c.ink }]}>
            {shortName(me.displayName)}
          </Text>
        </View>
        <Text className="font-mono" style={[typeStep("caption"), { paddingLeft: 11, color: c.ink3 }, TABULAR]}>
          {meta(me, myWeight)}
        </Text>
        {readiness ? (
          <ReadyStatus
            testID="ready-status-you"
            done={readiness.me}
            accessibilityLabel={`You, ${readiness.me ? "ready" : "not ready"}`}
            style={{ paddingLeft: 11 }}
          />
        ) : null}
      </View>
      <View style={{ width: 44, alignItems: "center", justifyContent: "center" }}>
        <Text className="font-display" style={[typeStep("title-xl"), { color: c.vs }]}>
          VS
        </Text>
      </View>
      <View style={{ flex: 1, paddingRight: 12, justifyContent: "center", alignItems: "flex-end", gap: 5, minWidth: 0 }}>
        <Text numberOfLines={1} className="font-heading uppercase" style={[typeStep("subhead"), { letterSpacing: TRACKING.loose, color: c.ink }]}>
          {shortName(opponent.displayName)}
        </Text>
        <Text className="font-mono" style={[typeStep("caption"), { color: c.ink3 }, TABULAR]}>
          {meta(opponent, opponentWeight)}
        </Text>
        {/* The testID and the "Opponent, ready|not ready" label are what the
            match-loop harness reads (waitOpponentReady). */}
        {readiness ? (
          <ReadyStatus
            testID="ready-panel-opponent"
            done={readiness.opponent}
            accessibilityLabel={`Opponent, ${readiness.opponent ? "ready" : "not ready"}`}
            style={{ justifyContent: "flex-end" }}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * One side's ready state in the chip: an amber dot and `NOT READY` while
 * pending (attention), an ink check and `READY` when done (done is not a
 * gain, so never Gain Green). Plain text, no edge: it is not a control.
 */
function ReadyStatus({
  done,
  testID,
  accessibilityLabel,
  style,
}: {
  done: boolean;
  testID: string;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const color = done ? p.text : p.amber;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[{ minHeight: 16, flexDirection: "row", alignItems: "center", gap: 6 }, style]}
    >
      {done ? (
        <Text maxFontSizeMultiplier={TOP_BAR_FONT_CAP} className="font-mono-bold" style={[typeStep("caption"), { color }, TABULAR]}>
          {"✓"}
        </Text>
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      )}
      {/* Capped like the top bar, so NOT READY never truncates and READY's check never grows its row. */}
      <Mono bold color={color} spacing="caps-l" numberOfLines={1} maxFontSizeMultiplier={TOP_BAR_FONT_CAP}>
        {done ? "READY" : "NOT READY"}
      </Mono>
    </View>
  );
}
