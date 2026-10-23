import * as React from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Check, Handshake, Pencil } from "lucide-react-native";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { OTHER_SUBMISSION_CODE, filterSubmissionTypes } from "@/lib/match-flow/filter-submissions";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import { usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS, TABULAR } from "../fight/fight-tokens";
import { TRACKING, typeSize, typeStep } from "@/lib/typography";
import { FightButton, InitialsBlock, Mono, initialsOf, shortName } from "../fight/fight-ui";
import { StatePressable } from "@/components/ui/state-pressable";
import { SelectCheck } from "@/components/ui/elo-system";
import type { MatchAthleteView, MatchCaps } from "@/lib/match-flow/match-roles";
import {
  useResultForm,
  type ResultFormInitial,
  type ResultFormState,
  type ResultSubmission,
} from "@/lib/match-flow/use-result-form";

export type { ResultFormInitial, ResultSubmission };

export type ResultAthlete = Pick<MatchAthleteView, "athleteId" | "displayName" | "currentElo" | "weightLbs">;

/** How the finishes are offered (`MatchCaps.submissionLayout`). */
export type SubmissionLayout = MatchCaps["submissionLayout"];

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
  [a.currentElo != null ? String(a.currentElo) : null, a.weightLbs != null ? `${Number(a.weightLbs.toFixed(1))} LBS` : null]
    .filter(Boolean)
    .join(" · ");

/**
 * Two big winner tiles (tap = "<name> won"). `me` is the left tile and
 * `opponent` the right. An athlete's tiles carry YOU and OPPONENT; with
 * `roleTags` off (the timekeeper, who is neither, and an admin) they carry
 * the names and ratings only.
 */
export function WinnerTiles({
  me,
  opponent,
  onPick,
  roleTags = true,
}: {
  me: ResultAthlete;
  opponent: ResultAthlete;
  onPick: (id: string) => void;
  roleTags?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      {[me, opponent].map((a) => (
        <StatePressable
          key={a.athleteId}
          testID={`result-winner-${a.athleteId}`}
          accessibilityRole="button"
          accessibilityLabel={`${a.displayName} won`}
          onPress={() => onPick(a.athleteId)}
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
          <InitialsBlock name={a.displayName} size={112} fontSize="display-36" />
          <View style={{ alignItems: "center", gap: 8 }}>
            <Text numberOfLines={1} className="font-heading uppercase" style={[typeStep("title"), { letterSpacing: TRACKING.loose, color: p.text }]}>
              {shortName(a.displayName)}
            </Text>
            {meta(a) ? (
              <Mono size="small" spacing="loose">
                {meta(a)}
              </Mono>
            ) : null}
            {roleTags ? (
              <Mono color={a.athleteId === me.athleteId ? p.text : p.text3}>{a.athleteId === me.athleteId ? "YOU" : "OPPONENT"}</Mono>
            ) : null}
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
        <Text className="font-heading" style={[typeStep("body"), { color: p.text }]}>
          {initialsOf(winner.displayName)}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Mono color={p.text3}>WINNER</Mono>
        <Text numberOfLines={1} className="font-heading uppercase" style={[typeStep("subhead"), { letterSpacing: TRACKING.loose, color: p.text }]}>
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
      <Text className="font-heading uppercase" style={[typeStep("body"), { letterSpacing: TRACKING.caps, color: p.red }]}>
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
      <Mono bold size="caption">
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
              <Text numberOfLines={2} className="font-heading" style={[typeStep("callout"), { flex: 1, color: p.text }]}>
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
      <Mono bold size="caption">
        FINISH TIME
      </Mono>
      <View
        style={{ height: 64, paddingLeft: 14, paddingRight: 6, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: p.plate, borderWidth: 1, borderColor: invalid ? p.loss : p.hairline, borderRadius: FIGHT_RADIUS.button }}
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
          style={[typeSize("headline-2xl"), { minWidth: 104, letterSpacing: TRACKING.tight, color: p.text, padding: 0 }, TABULAR]}
        />
        <View style={{ flex: 1 }}>
          {invalid ? (
            <Mono color={p.loss}>{`WITHIN ${formatElapsed(durationSeconds)}`}</Mono>
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

/**
 * The draw confirmation plate: the heading and Change. Its rating note was
 * removed in both modes (timekeeper mode A28, O1: no rating hints in a match).
 */
export function DrawPlate({ onChange }: { onChange: () => void }) {
  const p = usePalette();
  return (
    <View
      style={{ padding: 16, gap: 10, backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.plate }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Handshake size={22} color={p.amber} />
        <Text className="font-heading uppercase" style={[typeStep("subhead"), { flex: 1, letterSpacing: TRACKING.caps, color: p.text }]}>
          Match ends in a draw
        </Text>
        <ChangeButton onPress={onChange} testID="result-change-draw" />
      </View>
    </View>
  );
}

/** One row of the full list; fixed so a recorded finish can open scrolled to its row. */
const LIST_ROW_HEIGHT = 48;
/** Six and a half rows: the cut-off row says the list scrolls. */
const LIST_HEIGHT = LIST_ROW_HEIGHT * 6.5;

/**
 * Every finish in the catalogue as one scrollable list (timekeeper mode A12,
 * PM12: the timekeeper's layout, `MatchCaps.submissionLayout` "list"), in
 * catalogue order with the catch-all Other last. The rows keep the chips'
 * testIDs and the one selected-state treatment (`elo-system/selection.tsx`:
 * plate-bright fill, hairline-strong edge, ink label and ink check, never
 * red). The list scrolls inside the step's scroll, and opens on the chosen
 * row (an edit starts from the recorded finish).
 */
export function SubmissionList({
  submissionTypes,
  value,
  onChange,
}: {
  submissionTypes: SubmissionType[];
  value: string;
  onChange: (code: string) => void;
}) {
  const p = usePalette();
  const ordered = React.useMemo(
    () => [
      ...submissionTypes.filter((t) => t.code !== OTHER_SUBMISSION_CODE),
      ...submissionTypes.filter((t) => t.code === OTHER_SUBMISSION_CODE),
    ],
    [submissionTypes],
  );
  // Read once, on mount: the list opens on the chosen row, then scrolls freely.
  const [openOn] = React.useState(() => Math.max(0, ordered.findIndex((t) => t.code === value) - 1));
  const scrollRef = React.useRef<ScrollView>(null);
  const placedRef = React.useRef(false);
  // `contentOffset` is iOS only: once the rows are laid out, place the list on
  // the chosen row on every platform (once; then it scrolls freely).
  const placeOnChosen = React.useCallback(() => {
    if (placedRef.current) return;
    placedRef.current = true;
    if (openOn > 0) scrollRef.current?.scrollTo({ x: 0, y: openOn * LIST_ROW_HEIGHT, animated: false });
  }, [openOn]);
  return (
    <View style={{ gap: 10 }}>
      <Mono bold size="caption">
        HOW DID IT END?
      </Mono>
      <View
        testID="result-submission-list"
        style={{ height: LIST_HEIGHT, backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.plate, overflow: "hidden" }}
      >
        <ScrollView
          ref={scrollRef}
          testID="result-submission-list-scroll"
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentOffset={{ x: 0, y: openOn * LIST_ROW_HEIGHT }}
          onContentSizeChange={placeOnChosen}
        >
          {ordered.map((t, i) => (
            <SubmissionRow
              key={t.code}
              type={t}
              selected={t.code === value}
              // The chosen row draws its own edge; the row above it gives up its divider for it.
              divider={i < ordered.length - 1 && ordered[i + 1].code !== value}
              onPress={() => onChange(t.code)}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function SubmissionRow({
  type,
  selected,
  divider,
  onPress,
}: {
  type: SubmissionType;
  selected: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <StatePressable
      dim
      testID={`result-submission-${type.code}`}
      accessibilityRole="button"
      accessibilityLabel={type.display_name}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        height: LIST_ROW_HEIGHT,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: selected ? p.panel : p.plate,
        // Selected: the hairline-strong edge all round (inset, the row keeps its height).
        ...(selected ? { borderWidth: 1, borderColor: p.strong } : { borderBottomWidth: divider ? 1 : 0, borderColor: p.hairline }),
      }}
    >
      <Text numberOfLines={1} className="font-heading" style={[typeStep("callout"), { flex: 1, color: p.text }]}>
        {type.display_name}
      </Text>
      {selected ? <SelectCheck size={16} color={p.text} /> : null}
    </StatePressable>
  );
}

/** How the finishes are offered: the chip grid with search (default), or the full list (A12). */
export function SubmissionPicker({
  layout = "chips",
  ...props
}: {
  layout?: SubmissionLayout;
  submissionTypes: SubmissionType[];
  value: string;
  onChange: (code: string) => void;
}) {
  return layout === "list" ? <SubmissionList {...props} /> : <SubmissionGrid {...props} />;
}

/** The form's words. Each defaults to the shipped result step's. */
export interface ResultFormCopy {
  /** The heading (the harness reads and taps "Record result"). */
  title?: string;
  submit?: { text: string; busy: string };
  /** Under the heading: a state the recorder must know about (TK-D10). */
  notice?: string | null;
  /** Under the form: who records for whom (the claim line, TK-R1, TK-ED2). */
  kicker?: string | null;
}

const RECORD_RESULT = "Record result";
const SUBMIT_COPY = { text: RECORD_RESULT, busy: "Recording..." };

export interface ResultFormViewProps {
  /** The form's state (`useResultForm`), held by whoever renders it. */
  form: ResultFormState;
  /** The winner tiles, left to right. */
  athletes: readonly [ResultAthlete, ResultAthlete];
  /** YOU on the first tile and OPPONENT on the second (an athlete's form); off for the timekeeper and an admin. */
  roleTags: boolean;
  /** The latest finish time accepted (the WITHIN line). */
  boundSeconds: number;
  /** The clock when the match ended (ENDED AT); omitted, no line. */
  endedAtSeconds?: number | null;
  submissionTypes: SubmissionType[];
  submissionLayout?: SubmissionLayout;
  busy: boolean;
  onSubmit: (value: ResultSubmission) => void;
  copy?: ResultFormCopy;
}

/**
 * The result form as it renders: the winner tiles and Draw, then the chosen
 * winner with the finishes and the finish time (or the draw plate), the
 * record button and the line under it. Its state comes in (`form`), so the
 * claim-first result step keeps it across a waiting view; `ResultForm`
 * below is the self-contained form.
 */
export function ResultFormView({
  form,
  athletes,
  roleTags,
  boundSeconds,
  endedAtSeconds,
  submissionTypes,
  submissionLayout,
  busy,
  onSubmit,
  copy = {},
}: ResultFormViewProps) {
  const [left, right] = athletes;
  const winner = form.winnerId === left.athleteId ? left : form.winnerId === right.athleteId ? right : null;
  const submit = copy.submit ?? SUBMIT_COPY;
  function handleSubmit() {
    const value = form.value();
    if (value) onSubmit(value);
  }
  return (
    <View style={{ gap: 20 }}>
      <ResultFormHeader endedAtSeconds={endedAtSeconds} title={copy.title ?? RECORD_RESULT} notice={copy.notice ?? null} />

      {form.outcome === null ? (
        <>
          <Mono bold size="caption">
            TAP THE WINNER
          </Mono>
          <WinnerTiles me={left} opponent={right} onPick={form.pickWinner} roleTags={roleTags} />
          <FightButton
            testID="result-outcome-draw"
            variant="secondary"
            label="Draw"
            onPress={form.pickDraw}
            icon={(c) => <Handshake size={18} color={c} />}
          />
        </>
      ) : form.outcome === "draw" ? (
        <DrawPlate onChange={form.reset} />
      ) : winner ? (
        <>
          <WinnerChip winner={winner} onChange={form.reset} />
          <SubmissionPicker
            layout={submissionLayout}
            submissionTypes={submissionTypes}
            value={form.submissionCode}
            onChange={form.setSubmissionCode}
          />
          <FinishTimeField
            value={form.finishTimeStr}
            onChange={form.onFinishChange}
            fromClock={form.finishFromClock}
            invalid={form.finishInvalid}
            durationSeconds={boundSeconds}
          />
        </>
      ) : null}

      {form.outcome !== null ? (
        <FightButton testID="result-record" label={busy ? submit.busy : submit.text} onPress={handleSubmit} disabled={!form.canSubmit} busy={busy} />
      ) : null}

      {copy.kicker ? <ResultFormKicker text={copy.kicker} /> : null}
    </View>
  );
}

/** ENDED AT, the heading and, when given, a notice in the attention token. */
function ResultFormHeader({ endedAtSeconds, title, notice }: { endedAtSeconds?: number | null; title: string; notice: string | null }) {
  const p = usePalette();
  return (
    <View style={{ gap: 10 }}>
      {endedAtSeconds != null ? <Mono>{`ENDED AT ${formatElapsed(endedAtSeconds)}`}</Mono> : null}
      {/* A plain text element on purpose: the match-loop harness taps the
          StaticText "Record result" to drop the numeric keyboard. */}
      <Text className="font-heading uppercase" style={[typeStep("headline-2xl"), { letterSpacing: TRACKING.loose, color: p.text }]}>
        {title}
      </Text>
      {notice ? (
        <Text testID="result-form-notice" className="font-body" style={[typeStep("body"), { color: p.amber }]}>
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

/** The line under the form: who records for whom. */
function ResultFormKicker({ text }: { text: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.text }} />
      <Mono size="caption" spacing="loose">
        {text}
      </Mono>
    </View>
  );
}

export interface ResultFormProps {
  /**
   * The two athletes, challenger first (`MatchRoles.athletes`). The caller
   * (including M10) chooses the weights the tiles show through `weightLbs`:
   * the timekeeper's screens pass the rated weights (PM26), never the
   * profile weight.
   */
  athletes: readonly [ResultAthlete, ResultAthlete];
  /** The match length: the latest finish time when there is no final clock. */
  durationSeconds: number;
  /** The clock when the match ended: the latest finish time, the prefill and the ENDED AT line. */
  finalElapsedS?: number | null;
  submissionTypes: SubmissionType[];
  /** Default "chips"; the timekeeper and an admin record on the full "list" (A12). */
  submissionLayout?: SubmissionLayout;
  onSubmit: (value: ResultSubmission) => void;
  busy?: boolean;
  /** The line under the form (who records for whom). */
  kicker?: string | null;
  /** Start from a recorded result (the timekeeper's edit, A8). */
  initial?: ResultFormInitial | null;
  /** An edit of `initial`: the button stays off until the result differs from it (`useResultForm`). */
  requireChange?: boolean;
  /** The heading, the button and the notice; each defaults to the shipped result step's. */
  copy?: Omit<ResultFormCopy, "kicker">;
}

/**
 * The result form on its own, for whoever records a result for two athletes
 * they are not: the timekeeper's edit (A8) and Admin > Timekeeper reviews
 * (A27, slice M10, which wraps it and never edits this file). Everything
 * comes in as props and it reads no match-flow context, so it renders
 * standalone (review round 3, R3-4). The tiles carry no YOU / OPPONENT.
 */
export function ResultForm({
  athletes,
  durationSeconds,
  finalElapsedS = null,
  submissionTypes,
  submissionLayout,
  onSubmit,
  busy = false,
  kicker = null,
  initial = null,
  requireChange = false,
  copy,
}: ResultFormProps) {
  const boundSeconds = finalElapsedS ?? durationSeconds;
  const form = useResultForm({ prefillSeconds: finalElapsedS ?? undefined, boundSeconds, initial, requireChange });
  return (
    <ResultFormView
      form={form}
      athletes={athletes}
      roleTags={false}
      boundSeconds={boundSeconds}
      endedAtSeconds={finalElapsedS}
      submissionTypes={submissionTypes}
      submissionLayout={submissionLayout}
      busy={busy}
      onSubmit={onSubmit}
      copy={{ ...copy, kicker }}
    />
  );
}
