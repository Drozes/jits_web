import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
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
import {
  createSession,
  updateSession,
  cancelSession,
} from "@jits/shared/api/mutations";
import type { SessionListItem } from "@jits/shared/types/session";
import {
  addHours,
  combineDateAndTime,
  durationHours,
} from "@/lib/gym-manager/session-datetime";

type DurationPreset = 1 | 2 | 3;

const DURATION_PRESETS: { value: DurationPreset; label: string }[] = [
  { value: 1, label: "1h" },
  { value: 2, label: "2h" },
  { value: 3, label: "3h" },
];

/** A start time rounded up to the next half hour, used as the create default. */
function defaultStart(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  d.setMinutes(mins <= 30 ? 30 : 60);
  return d;
}

interface SessionEditSheetProps {
  gymId: string;
  /** When provided, the sheet edits this session; otherwise it creates one. */
  session?: SessionListItem | null;
  onSaved: () => void;
  children: React.ReactElement;
}

/**
 * H3 · Gym-owner one-time session create / edit. No recurrence UI (recurring
 * sessions are templates, handled elsewhere). Edits write through updateSession;
 * "Delete Session" cancels via cancelSession (sessions are soft-cancelled, not
 * hard-deleted). Date + time use the native pickers; the end is derived from a
 * duration preset.
 */
export function SessionEditSheet({
  gymId,
  session,
  onSaved,
  children,
}: SessionEditSheetProps) {
  const tokens = useThemedTokens();
  const sheet = React.useRef<SheetController | null>(null);
  const isEdit = !!session;

  const initialStart = session ? new Date(session.scheduledStart) : defaultStart();
  const initialDuration = session
    ? (Math.min(3, Math.max(1, durationHours(
        new Date(session.scheduledStart),
        new Date(session.scheduledEnd),
      ))) as DurationPreset)
    : 2;

  const [loading, setLoading] = React.useState(false);
  const [title, setTitle] = React.useState(session?.title ?? "Open Mat");
  const [start, setStart] = React.useState<Date>(initialStart);
  const [duration, setDuration] = React.useState<DurationPreset>(initialDuration);
  const [maxParticipants, setMaxParticipants] = React.useState(
    session?.maxParticipants?.toString() ?? "20",
  );
  const [iosDateOpen, setIosDateOpen] = React.useState(false);
  const [iosTimeOpen, setIosTimeOpen] = React.useState(false);

  function applyDate(picked: Date) {
    setStart((prev) => combineDateAndTime(picked, prev));
  }
  function applyTime(picked: Date) {
    setStart((prev) => combineDateAndTime(prev, picked));
  }

  function openPicker(mode: "date" | "time") {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: start,
        mode,
        display: "default",
        minimumDate: mode === "date" ? new Date() : undefined,
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type === "set" && picked) {
            if (mode === "date") applyDate(picked);
            else applyTime(picked);
          }
        },
      });
      return;
    }
    if (mode === "date") setIosDateOpen((v) => !v);
    else setIosTimeOpen((v) => !v);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setLoading(true);
    const scheduledStart = start.toISOString();
    const scheduledEnd = addHours(start, duration).toISOString();
    const max = parseInt(maxParticipants, 10);
    const maxValue = max > 0 ? max : null;

    const result = isEdit
      ? await updateSession(supabase, session!.id, {
          title: title.trim(),
          scheduledStart,
          scheduledEnd,
          maxParticipants: maxValue,
        })
      : await createSession(supabase, {
          gymId,
          title: title.trim() || undefined,
          scheduledStart,
          scheduledEnd,
          maxParticipants: maxValue ?? undefined,
        });

    if (result.ok) {
      toast.success(isEdit ? "Session updated" : "Session created");
      onSaved();
      sheet.current?.close();
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  function confirmDelete() {
    Alert.alert("Delete this session?", "This cancels the session for everyone.", [
      { text: "Keep", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void handleDelete() },
    ]);
  }

  async function handleDelete() {
    if (!session) return;
    setLoading(true);
    const result = await cancelSession(supabase, session.id);
    if (result.ok) {
      toast.success("Session deleted");
      onSaved();
      sheet.current?.close();
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Sheet controllerRef={sheet}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent snapPoints={["85%"]}>
        <SheetHeader>
          <SheetTitle className="font-heading text-[18px] text-ink uppercase tracking-caps">
            {isEdit ? "Edit Session" : "New Session"}
          </SheetTitle>
        </SheetHeader>

        <Plate className="gap-4 mt-2">
          <Field label="Session Name">
            <ElevatedInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Open Mat"
              tokens={tokens}
            />
          </Field>

          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <FieldLabel>Date</FieldLabel>
              <PickerButton label={dateLabel} onPress={() => openPicker("date")} />
            </View>
            <View className="flex-1 gap-1.5">
              <FieldLabel>Start Time</FieldLabel>
              <PickerButton label={timeLabel} onPress={() => openPicker("time")} />
            </View>
          </View>

          {Platform.OS === "ios" && iosDateOpen ? (
            <DateTimePicker
              value={start}
              mode="date"
              display="spinner"
              minimumDate={new Date()}
              textColor={tokens.cardForeground}
              onChange={(_e, picked) => {
                if (picked) applyDate(picked);
              }}
            />
          ) : null}
          {Platform.OS === "ios" && iosTimeOpen ? (
            <DateTimePicker
              value={start}
              mode="time"
              display="spinner"
              textColor={tokens.cardForeground}
              onChange={(_e, picked) => {
                if (picked) applyTime(picked);
              }}
            />
          ) : null}

          <Field label="Duration">
            <View className="flex-row gap-2">
              {DURATION_PRESETS.map((d) => {
                const selected = duration === d.value;
                return (
                  <Pressable
                    key={d.value}
                    onPress={() => setDuration(d.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={
                      selected
                        ? "flex-1 h-10 items-center justify-center rounded-xs bg-cta active:bg-cta-hover"
                        : "flex-1 h-10 items-center justify-center rounded-xs bg-surface-4 border border-hairline-strong active:bg-surface-3"
                    }
                  >
                    <Text
                      className={
                        selected
                          ? "font-heading text-[12px] text-ink-on-cta uppercase tracking-caps"
                          : "font-heading text-[12px] text-ink uppercase tracking-caps"
                      }
                    >
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
        </Plate>

        <Pressable
          onPress={handleSave}
          disabled={loading || !title.trim()}
          accessibilityRole="button"
          className={
            loading || !title.trim()
              ? "mt-4 bg-cta rounded-sm py-3 px-5 items-center justify-center opacity-50"
              : "mt-4 bg-cta rounded-sm py-3 px-5 items-center justify-center active:bg-cta-hover"
          }
        >
          {loading ? (
            <ActivityIndicator size="small" color={tokens.textOnAccent} />
          ) : (
            <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
              {isEdit ? "Save Session" : "Create Session"}
            </Text>
          )}
        </Pressable>

        {isEdit ? (
          <Pressable
            onPress={confirmDelete}
            disabled={loading}
            accessibilityRole="button"
            className={
              loading
                ? "mt-2 border border-primary rounded-sm py-3 px-5 items-center justify-center opacity-50"
                : "mt-2 border border-primary rounded-sm py-3 px-5 items-center justify-center active:bg-surface-3"
            }
          >
            <Text className="font-heading text-[13px] text-primary uppercase tracking-caps">
              Delete Session
            </Text>
          </Pressable>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
      {children}
    </Text>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </View>
  );
}

function PickerButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="h-11 px-4 rounded-xs bg-surface-4 border border-hairline justify-center active:bg-surface-3"
    >
      <Text className="font-mono text-[14px] text-ink tabular-nums" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
