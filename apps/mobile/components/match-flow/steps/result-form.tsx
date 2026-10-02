import * as React from "react";
import { Text, TextInput, View } from "react-native";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Check, Handshake, Pencil } from "lucide-react-native";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { OTHER_SUBMISSION_CODE, filterSubmissionTypes } from "@/lib/match-flow/filter-submissions";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import { usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS, TABULAR } from "../fight/fight-tokens";
import { InitialsBlock, Mono, initialsOf, shortName } from "../fight/fight-ui";
import { StatePressable } from "@/components/ui/state-pressable";

export interface ResultAthlete {
  id: string;
  displayName: string;
  elo: number | null;
  weight: number | null;
}

/** The eight finishes offered as one-tap chips, most common first. Codes
 * missing from the catalogue are skipped; the search covers everything. */
const COMMON_CODES = [
  "rear_naked_choke",
  "armbar",
  "triangle_choke",
  "guillotine",
  "kimura",
  "heel_hook",
  "arm_triangle_choke",
  "arm_triangle",
  "darce_choke",
  "americana",
  "omoplata",
  "ezekiel_choke",
];

export function commonSubmissions(types: SubmissionType[], count = 8): SubmissionType[] {
  const byCode = new Map(types.map((t) => [t.code, t]));
  const picked = COMMON_CODES.flatMap((c) => (byCode.has(c) ? [byCode.get(c)!] : []));
  if (picked.length < count) {
    for (const t of types) {
      if (picked.length >= count) break;
      if (t.code !== OTHER_SUBMISSION_CODE && !picked.includes(t)) picked.push(t);
    }
  }
  return picked.slice(0, count);
}

const meta = (a: ResultAthlete) =>
  [a.elo != null ? String(a.elo) : null, a.weight != null ? `${Number(a.weight.toFixed(1))} LBS` : null]
    .filter(Boolean)
    .join(" · ");

/** Two big winner tiles (tap = "<name> won"). */
export function WinnerTiles({
  me,
  opponent,
  onPick,
}: {
  me: ResultAthlete;
  opponent: ResultAthlete;
  onPick: (id: string) => void;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      {[me, opponent].map((a) => (
        <StatePressable
          key={a.id}
          testID={`result-winner-${a.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${a.displayName} won`}
          onPress={() => onPick(a.id)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 260,
            paddingVertical: 20,
            paddingHorizontal: 14,
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            backgroundColor: pressed ? p.panel : p.plate,
            borderWidth: 1,
            borderColor: pressed ? p.strong : p.hairline,
            borderRadius: FIGHT_RADIUS.plate,
          })}
        >
          <InitialsBlock name={a.displayName} size={112} fontSize={36} />
          <View style={{ alignItems: "center", gap: 8 }}>
            <Text numberOfLines={1} className="font-heading uppercase" style={{ fontSize: 18, letterSpacing: 0.72, color: p.text }}>
              {shortName(a.displayName)}
            </Text>
            {meta(a) ? (
              <Mono size={12} spacing={0.56}>
                {meta(a)}
              </Mono>
            ) : null}
            <Mono color={a.id === me.id ? p.text : p.text3}>{a.id === me.id ? "YOU" : "OPPONENT"}</Mono>
          </View>
        </StatePressable>
      ))}
    </View>
  );
}

/** The chosen winner on a themed plate, with Change. */
export function WinnerChip({ winner, onChange }: { winner: ResultAthlete; onChange: () => void }) {
  const p = usePalette();
  return (
    <View
      testID="result-winner-chip"
      style={{ height: 56, paddingLeft: 10, paddingRight: 6, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: p.plate, borderWidth: 1, borderColor: p.strong, borderRadius: FIGHT_RADIUS.button }}
    >
      <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: p.panel, borderWidth: 1, borderColor: p.strong, borderRadius: FIGHT_RADIUS.tag }}>
        <Text className="font-heading" style={{ fontSize: 13, color: p.text }}>
          {initialsOf(winner.displayName)}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Mono color={p.text3}>WINNER</Mono>
        <Text numberOfLines={1} className="font-heading uppercase" style={{ fontSize: 16, letterSpacing: 0.64, color: p.text }}>
          {shortName(winner.displayName)}
        </Text>
      </View>
      <ChangeButton onPress={onChange} />
    </View>
  );
}

export function ChangeButton({ onPress, testID = "result-change" }: { onPress: () => void; testID?: string }) {
  const p = usePalette();
  return (
    <PressableScale testID={testID} accessibilityRole="button" accessibilityLabel="Change" onPress={onPress} style={{ height: 44, paddingHorizontal: 12, justifyContent: "center" }}>
      <Text className="font-heading uppercase" style={{ fontSize: 13, letterSpacing: 0.8, color: p.red }}>
        Change
      </Text>
    </PressableScale>
  );
}

/** Eight one-tap finishes plus the full catalogue search. */
export function SubmissionGrid({
  submissionTypes,
  value,
  onChange,
}: {
  submissionTypes: SubmissionType[];
  value: string;
  onChange: (code: string) => void;
}) {
  const p = usePalette();
  const common = React.useMemo(() => commonSubmissions(submissionTypes), [submissionTypes]);
  const toOption = (t: SubmissionType): SearchSelectOption => ({ label: t.display_name, value: t.code });
  const getOptions = React.useCallback((q: string) => filterSubmissionTypes(submissionTypes, q).map(toOption), [submissionTypes]);
  const other = submissionTypes.find((t) => t.code === OTHER_SUBMISSION_CODE);
  const inGrid = common.some((t) => t.code === value);
  const searchedLabel = inGrid ? undefined : submissionTypes.find((t) => t.code === value)?.display_name;
  return (
    <View style={{ gap: 10 }}>
      <Mono bold size={11}>
        HOW DID IT END?
      </Mono>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {common.map((t) => {
          const selected = t.code === value;
          return (
            <StatePressable
              dim
              key={t.code}
              testID={`result-submission-${t.code}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(t.code)}
              style={{
                width: "48.5%",
                height: 54,
                paddingHorizontal: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                // The one selected-state treatment: plate-bright, a strong edge and
                // an ink check; never a red tint, edge or check (WP2, R3 MF-5).
                backgroundColor: selected ? p.panel : p.plate,
                borderWidth: 1,
                borderColor: selected ? p.strong : p.hairline,
                borderRadius: FIGHT_RADIUS.button,
              }}
            >
              <Text numberOfLines={2} className="font-heading" style={{ flex: 1, fontSize: 14, color: p.text }}>
                {t.display_name}
              </Text>
              {selected ? <Check size={16} color={p.text} /> : null}
            </StatePressable>
          );
        })}
      </View>
      <SearchSelect
        testID="result-submission"
        value={inGrid ? "" : value}
        displayLabel={searchedLabel}
        onSelect={onChange}
        title="Submission"
        accessibilityLabel="Search all submissions"
        placeholder="Search all submissions"
        searchPlaceholder="Search submissions"
        getOptions={getOptions}
        emptyHint="No submissions available."
        noMatchesText="No submissions match"
        noMatchesOptions={other ? [toOption(other)] : undefined}
      />
    </View>
  );
}

/** The finish time: big mono value, prefilled from the clock, editable. */
export function FinishTimeField({
  value,
  onChange,
  fromClock,
  invalid,
  durationSeconds,
}: {
  value: string;
  onChange: (v: string) => void;
  fromClock: boolean;
  invalid: boolean;
  durationSeconds: number;
}) {
  const p = usePalette();
  const inputRef = React.useRef<TextInput>(null);
  return (
    <View style={{ gap: 8 }}>
      <Mono bold size={11}>
        FINISH TIME
      </Mono>
      <View
        style={{ height: 64, paddingLeft: 14, paddingRight: 6, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: p.plate, borderWidth: 1, borderColor: invalid ? p.red : p.hairline, borderRadius: FIGHT_RADIUS.button }}
      >
        <TextInput
          ref={inputRef}
          testID="result-finish-time"
          accessibilityLabel="Finish time"
          placeholder="mm:ss"
          placeholderTextColor={p.text3}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          maxLength={5}
          className="font-mono-bold"
          style={[{ minWidth: 104, fontSize: 30, letterSpacing: -0.6, color: p.text, padding: 0 }, TABULAR]}
        />
        <View style={{ flex: 1 }}>
          {invalid ? (
            <Mono color={p.red}>{`WITHIN ${formatElapsed(durationSeconds)}`}</Mono>
          ) : fromClock ? (
            <Mono testID="result-finish-time-hint" color={p.text3}>
              FROM MATCH CLOCK
            </Mono>
          ) : null}
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Edit finish time"
          onPress={() => inputRef.current?.focus()}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Pencil size={16} color={p.text2} />
        </PressableScale>
      </View>
    </View>
  );
}

/** The draw confirmation plate. */
export function DrawPlate({ onChange }: { onChange: () => void }) {
  const p = usePalette();
  return (
    <View
      style={{ padding: 16, gap: 10, backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.plate }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Handshake size={22} color={p.amber} />
        <Text className="font-heading uppercase" style={{ flex: 1, fontSize: 15, letterSpacing: 1, color: p.text }}>
          Match ends in a draw
        </Text>
        <ChangeButton onPress={onChange} testID="result-change-draw" />
      </View>
      <Text className="font-body" style={{ fontSize: 13, color: p.text2 }}>
        Draws cost both athletes rating.
      </Text>
    </View>
  );
}
