import * as React from "react";
import { BackHandler, Pressable, Text, TextInput, View } from "react-native";
import { ChevronLeft, Pencil } from "lucide-react-native";
import { isValidAthleteWeight } from "@jits/shared/api/athlete-weight";
import { ON_MEDIA, usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS, TABULAR } from "../fight/fight-tokens";
import { InitialsBlock, KindTag, Mono, shortName } from "../fight/fight-ui";
import { useFaceoffContext } from "./faceoff-context";

export interface FaceoffAthlete {
  display_name: string;
  current_elo: number | null;
}

interface FaceoffTopProps {
  phase: "weight" | "ready";
  matchType: "ranked" | "casual";
  me: FaceoffAthlete;
  opponent: FaceoffAthlete;
}

function weightText(lbs: number | null): string {
  return lbs != null ? `${Number(lbs.toFixed(1))} LBS` : "-- LBS";
}

/**
 * The face-off header, above the camera: the top bar (Leave, phase, kind)
 * and the fight card. Big on the weigh-in, compressed to the light athlete
 * chip on the ready phase so the camera framing panel fits under it.
 */
export function FaceoffTop({ phase, matchType, me, opponent }: FaceoffTopProps) {
  const f = useFaceoffContext();
  const p = usePalette();
  const { canLeave, leave } = f;

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
      <View style={{ height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {canLeave ? (
          <Pressable
            testID="faceoff-leave"
            accessibilityRole="button"
            // The harness and screen readers know this control as "Cancel
            // match": it cancels the match for both athletes.
            accessibilityLabel="Cancel match"
            accessibilityState={{ disabled: f.cancelling }}
            disabled={f.cancelling}
            onPress={leave}
            hitSlop={8}
            style={({ pressed }) => ({ height: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || f.cancelling ? 0.6 : 1 })}
          >
            <ChevronLeft size={18} color={p.text} />
            <Text className="font-heading uppercase" style={{ fontSize: 13, letterSpacing: 1.12, color: p.text }}>
              {f.cancelling ? "Leaving..." : "Leave"}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
        <Mono bold color={p.text3}>
          {phase === "weight" ? "FACE-OFF · WEIGH IN" : "FACE-OFF · READY"}
        </Mono>
        <KindTag kind={matchType} />
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
            <Pressable
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
            </Pressable>
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
        <Pressable
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
        </Pressable>
        <Pressable
          testID="faceoff-weight-cancel"
          accessibilityRole="button"
          accessibilityLabel="Cancel weight edit"
          onPress={() => f.setWeightEditorOpen(false)}
          style={{ minWidth: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text className="font-heading uppercase" style={{ fontSize: 13, letterSpacing: 0.8, color: p.text2 }}>
            Cancel
          </Text>
        </Pressable>
      </View>
      <Text testID="faceoff-weight-edit-note" className="font-body" style={{ fontSize: 12, color: p.text2 }}>
        Updates your profile weight for future matches. This match keeps its weigh-in.
      </Text>
    </View>
  );
}

/**
 * The compressed light athlete chip on the ready phase (and over the camera
 * on the countdown). Fixed light, as the live athlete bar, in both themes;
 * the hairline border separates it from a light page.
 */
export function FaceoffChip({
  me,
  opponent,
  myWeight,
  opponentWeight,
  height = 64,
}: {
  me: FaceoffAthlete;
  opponent: FaceoffAthlete;
  myWeight: number | null;
  opponentWeight: number | null;
  height?: number;
}) {
  const meta = (a: FaceoffAthlete, w: number | null) =>
    [a.current_elo != null ? String(a.current_elo) : null, w != null ? `${Number(w.toFixed(1))} LBS` : null]
      .filter(Boolean)
      .join(" · ");
  return (
    <View
      style={{ height, flexDirection: "row", backgroundColor: ON_MEDIA.chip, borderWidth: 1, borderColor: ON_MEDIA.chipBorder, borderRadius: FIGHT_RADIUS.button }}
    >
      <View style={{ flex: 1, paddingLeft: 12, justifyContent: "center", gap: 5, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <View style={{ width: 4, height: 4, backgroundColor: ON_MEDIA.cta }} />
          <Text numberOfLines={1} className="font-heading uppercase" style={{ fontSize: 15, letterSpacing: 0.6, color: ON_MEDIA.ink }}>
            {shortName(me.display_name)}
          </Text>
        </View>
        <Text className="font-mono" style={[{ paddingLeft: 11, fontSize: 11, color: ON_MEDIA.ink3 }, TABULAR]}>
          {meta(me, myWeight)}
        </Text>
      </View>
      <View style={{ width: 44, alignItems: "center", justifyContent: "center" }}>
        <Text className="font-display" style={{ fontSize: 22, color: ON_MEDIA.inkRed }}>
          VS
        </Text>
      </View>
      <View style={{ flex: 1, paddingRight: 12, justifyContent: "center", alignItems: "flex-end", gap: 5, minWidth: 0 }}>
        <Text numberOfLines={1} className="font-heading uppercase" style={{ fontSize: 15, letterSpacing: 0.6, color: ON_MEDIA.ink }}>
          {shortName(opponent.display_name)}
        </Text>
        <Text className="font-mono" style={[{ fontSize: 11, color: ON_MEDIA.ink3 }, TABULAR]}>
          {meta(opponent, opponentWeight)}
        </Text>
      </View>
    </View>
  );
}
