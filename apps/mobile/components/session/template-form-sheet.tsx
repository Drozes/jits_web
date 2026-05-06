import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      <SheetContent snapPoints={["85%"]}>
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Template" : "New Template"}</SheetTitle>
        </SheetHeader>
        <TemplateFormFields
          title={title}
          setTitle={setTitle}
          dayOfWeek={dayOfWeek}
          setDayOfWeek={setDayOfWeek}
          startTime={startTime}
          setStartTime={setStartTime}
          duration={duration}
          setDuration={setDuration}
          maxParticipants={maxParticipants}
          setMaxParticipants={setMaxParticipants}
          notes={notes}
          setNotes={setNotes}
          loading={loading}
          isEdit={isEdit}
          onSubmit={handleSubmit}
          tokens={tokens}
        />
      </SheetContent>
    </Sheet>
  );
}

interface FieldsProps {
  title: string;
  setTitle: (v: string) => void;
  dayOfWeek: string;
  setDayOfWeek: (v: string) => void;
  startTime: string;
  setStartTime: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  maxParticipants: string;
  setMaxParticipants: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  loading: boolean;
  isEdit: boolean;
  onSubmit: () => void;
  tokens: ReturnType<typeof useThemedTokens>;
}

function TemplateFormFields(p: FieldsProps) {
  return (
    <View className="gap-4">
      <View className="gap-1.5">
        <Label>Title</Label>
        <Input value={p.title} onChangeText={p.setTitle} placeholder="Open Mat" />
      </View>

      <View className="gap-1.5">
        <Label>Day of Week</Label>
        <Select value={p.dayOfWeek} onValueChange={p.setDayOfWeek}>
          <SelectTrigger>
            <SelectValue placeholder="Select day" />
          </SelectTrigger>
          <SelectContent>
            {DAYS.map((d, i) => (
              <SelectItem key={i} value={String(i)}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </View>

      <View className="gap-1.5">
        <Label>Start Time</Label>
        <Input
          value={p.startTime}
          onChangeText={p.setStartTime}
          placeholder="10:00"
          keyboardType="numbers-and-punctuation"
        />
      </View>

      <View className="gap-1.5">
        <Label>Duration</Label>
        <View className="flex-row gap-2">
          {DURATION_PRESETS.map((d) => (
            <Button
              key={d.value}
              variant={p.duration === d.value ? "default" : "outline"}
              size="sm"
              onPress={() => p.setDuration(d.value)}
              className="flex-1"
            >
              {d.label}
            </Button>
          ))}
        </View>
      </View>

      <View className="gap-1.5">
        <Label>Max Participants (optional)</Label>
        <Input
          value={p.maxParticipants}
          onChangeText={p.setMaxParticipants}
          keyboardType="number-pad"
          placeholder="20"
        />
      </View>

      <View className="gap-1.5">
        <Label>Notes (optional)</Label>
        <Input
          value={p.notes}
          onChangeText={p.setNotes}
          placeholder="Any details..."
          multiline
          numberOfLines={2}
          className="h-16"
          style={{ textAlignVertical: "top" }}
        />
      </View>

      <Button onPress={p.onSubmit} disabled={p.loading || !p.title.trim()} className="mt-2">
        {p.loading ? (
          <ActivityIndicator size="small" color={p.tokens.primaryForeground} />
        ) : (
          <Text className="text-sm font-medium text-primary-foreground">
            {p.isEdit ? "Save Changes" : "Create Template"}
          </Text>
        )}
      </Button>
    </View>
  );
}
