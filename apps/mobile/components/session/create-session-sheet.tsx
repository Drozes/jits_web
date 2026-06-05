import * as React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetController,
} from "@/components/ui/sheet";
import { Plate } from "@/components/ui/elo-system";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { createSession } from "@jits/shared/api/mutations";

type StartPreset = "now" | "+30" | "+60";
type DurationPreset = 1 | 2 | 3;

const START_PRESETS: { value: StartPreset; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "+30", label: "+30m" },
  { value: "+60", label: "+1h" },
];
const DURATION_PRESETS: { value: DurationPreset; label: string }[] = [
  { value: 1, label: "1h" },
  { value: 2, label: "2h" },
  { value: 3, label: "3h" },
];

function computeStartTime(preset: StartPreset): Date {
  const now = new Date();
  if (preset === "+30") return new Date(now.getTime() + 30 * 60_000);
  if (preset === "+60") return new Date(now.getTime() + 60 * 60_000);
  return now;
}

interface CreateSessionSheetProps {
  gymId: string;
  onCreated: () => void;
  children: React.ReactElement;
}

export function CreateSessionSheet({ gymId, onCreated, children }: CreateSessionSheetProps) {
  const tokens = useThemedTokens();
  const sheet = React.useRef<SheetController | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [title, setTitle] = React.useState("Open Mat");
  const [startPreset, setStartPreset] = React.useState<StartPreset>("now");
  const [duration, setDuration] = React.useState<DurationPreset>(2);
  const [maxParticipants, setMaxParticipants] = React.useState("20");
  const [notes, setNotes] = React.useState("");

  async function handleCreate() {
    setLoading(true);
    const startDate = computeStartTime(startPreset);
    const endDate = new Date(startDate.getTime() + duration * 60 * 60_000);
    const max = parseInt(maxParticipants, 10);

    const result = await createSession(supabase, {
      gymId,
      title: title.trim() || undefined,
      scheduledStart: startDate.toISOString(),
      scheduledEnd: endDate.toISOString(),
      maxParticipants: max > 0 ? max : undefined,
      notes: notes.trim() || undefined,
    });

    if (result.ok) {
      toast.success("Session created");
      onCreated();
      sheet.current?.close();
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  return (
    <Sheet controllerRef={sheet}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent snapPoints={["80%"]}>
        <SheetHeader>
          <SheetTitle className="font-heading text-[18px] text-ink uppercase tracking-caps">
            New Session
          </SheetTitle>
        </SheetHeader>

        <Plate className="gap-4 mt-2">
          <Field label="Title">
            <ElevatedInput value={title} onChangeText={setTitle} placeholder="Open Mat" tokens={tokens} />
          </Field>

          <Field label="Start Time">
            <PresetRow
              options={START_PRESETS}
              selected={startPreset}
              onSelect={setStartPreset}
            />
          </Field>

          <Field label="Duration">
            <PresetRow
              options={DURATION_PRESETS}
              selected={duration}
              onSelect={setDuration}
            />
          </Field>

          <Field label="Max Participants">
            <ElevatedInput
              value={maxParticipants}
              onChangeText={setMaxParticipants}
              keyboardType="number-pad"
              placeholder="20"
              tokens={tokens}
            />
          </Field>

          <Field label="Notes (optional)">
            <ElevatedInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Details for participants..."
              multiline
              numberOfLines={2}
              tokens={tokens}
              className="h-16"
              style={{ textAlignVertical: "top", paddingTop: 10 }}
            />
          </Field>
        </Plate>

        <Pressable
          onPress={handleCreate}
          disabled={loading}
          accessibilityRole="button"
          className={
            loading
              ? "mt-4 bg-cta rounded-sm py-3 px-5 items-center justify-center opacity-50"
              : "mt-4 bg-cta rounded-sm py-3 px-5 items-center justify-center active:bg-cta-hover"
          }
        >
          {loading ? (
            <ActivityIndicator size="small" color={tokens.textOnAccent} />
          ) : (
            <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
              Create Session
            </Text>
          )}
        </Pressable>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {label}
      </Text>
      {children}
    </View>
  );
}

function PresetRow<T extends string | number>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  return (
    <View className="flex-row gap-2">
      {options.map((o) => {
        const isSel = selected === o.value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onSelect(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSel }}
            className={
              isSel
                ? "flex-1 h-10 items-center justify-center rounded-xs bg-cta active:bg-cta-hover"
                : "flex-1 h-10 items-center justify-center rounded-xs bg-surface-4 border border-hairline-strong active:bg-surface-3"
            }
          >
            <Text
              className={
                isSel
                  ? "font-heading text-[12px] text-ink-on-cta uppercase tracking-caps"
                  : "font-heading text-[12px] text-ink uppercase tracking-caps"
              }
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ElevatedInput({
  tokens,
  className,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  tokens: ReturnType<typeof useThemedTokens>;
  className?: string;
}) {
  return (
    <TextInput
      placeholderTextColor={tokens.textTertiary}
      className={[
        "h-11 px-4 rounded-xs bg-surface-4 border border-hairline text-ink font-mono text-[14px]",
        className ?? "",
      ].join(" ")}
      {...props}
    />
  );
}
