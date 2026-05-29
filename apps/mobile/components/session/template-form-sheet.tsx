import * as React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plate } from "@/components/ui/elo-system";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { createSessionTemplate, updateSessionTemplate } from "@jits/shared/api/mutations";
import type { SessionTemplate } from "@jits/shared/types/session";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DURATION_PRESETS = [
  { value: 60, label: "1h" },
  { value: 90, label: "1.5h" },
  { value: 120, label: "2h" },
  { value: 180, label: "3h" },
];

interface TemplateFormSheetProps {
  gymId: string;
  template?: SessionTemplate | null;
  onSaved: () => void;
  children: React.ReactElement;
}

export function TemplateFormSheet({
  gymId,
  template,
  onSaved,
  children,
}: TemplateFormSheetProps) {
  const tokens = useThemedTokens();
  const isEdit = !!template;
  const [loading, setLoading] = React.useState(false);
  const [title, setTitle] = React.useState(template?.title ?? "Open Mat");
  const [dayOfWeek, setDayOfWeek] = React.useState(String(template?.day_of_week ?? 1));
  const [startTime, setStartTime] = React.useState(template?.start_time?.slice(0, 5) ?? "10:00");
  const [duration, setDuration] = React.useState(template?.duration_minutes ?? 120);
  const [maxParticipants, setMaxParticipants] = React.useState(
    template?.max_participants?.toString() ?? "",
  );
  const [notes, setNotes] = React.useState(template?.notes ?? "");

  async function handleSubmit() {
    if (!title.trim()) return;
    setLoading(true);

    const maxP = maxParticipants ? Number(maxParticipants) : null;
    const result = isEdit
      ? await updateSessionTemplate(supabase, template!.id, {
          title: title.trim(),
          dayOfWeek: Number(dayOfWeek),
          startTime: startTime + ":00",
          durationMinutes: duration,
          maxParticipants: maxP,
          notes: notes.trim() || null,
        })
      : await createSessionTemplate(supabase, {
          gymId,
          title: title.trim(),
          dayOfWeek: Number(dayOfWeek),
          startTime: startTime + ":00",
          durationMinutes: duration,
          maxParticipants: maxP,
          notes: notes.trim() || null,
        });

    if (result.ok) {
      toast.success(isEdit ? "Template updated" : "Template created");
      onSaved();
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent snapPoints={["88%"]}>
        <SheetHeader>
          <SheetTitle className="font-heading text-[18px] text-ink uppercase tracking-caps">
            {isEdit ? "Edit Template" : "New Template"}
          </SheetTitle>
        </SheetHeader>

        <Plate className="gap-4 mt-2">
          <Field label="Title">
            <ElevatedInput value={title} onChangeText={setTitle} placeholder="Open Mat" tokens={tokens} />
          </Field>

          <Field label="Day of Week">
            <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
              <SelectTrigger className="h-11 px-4 rounded-xs bg-surface-4 border border-hairline">
                <SelectValue placeholder="Select day" className="font-mono uppercase tracking-caps-l text-ink text-[14px]" />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Start Time">
            <ElevatedInput
              value={startTime}
              onChangeText={setStartTime}
              placeholder="10:00"
              keyboardType="numbers-and-punctuation"
              tokens={tokens}
            />
          </Field>

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
                        : "flex-1 h-10 items-center justify-center rounded-xs bg-surface-4 border border-hairline-strong"
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

          <Field label="Max Participants (optional)">
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
              placeholder="Any details..."
              multiline
              numberOfLines={2}
              tokens={tokens}
              className="h-16"
              style={{ textAlignVertical: "top", paddingTop: 10 }}
            />
          </Field>
        </Plate>

        <Pressable
          onPress={handleSubmit}
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
              {isEdit ? "Save Changes" : "Create Template"}
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
