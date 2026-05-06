import * as React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Plus } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { createSession } from "@jits/shared/api/mutations";

type StartPreset = "now" | "+30" | "+60";
type DurationPreset = 1 | 2 | 3;

const START_PRESETS: { value: StartPreset; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "+30", label: "+30 min" },
  { value: "+60", label: "+1 hour" },
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
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent snapPoints={["75%"]}>
        <SheetHeader>
          <SheetTitle>Create Session</SheetTitle>
        </SheetHeader>

        <View className="gap-4">
          <FieldLabel label="Title">
            <Input value={title} onChangeText={setTitle} placeholder="Open Mat" />
          </FieldLabel>

          <FieldLabel label="Start Time">
            <PresetRow
              options={START_PRESETS}
              selected={startPreset}
              onSelect={setStartPreset}
            />
          </FieldLabel>

          <FieldLabel label="Duration">
            <PresetRow
              options={DURATION_PRESETS}
              selected={duration}
              onSelect={setDuration}
            />
          </FieldLabel>

          <FieldLabel label="Max Participants">
            <Input
              value={maxParticipants}
              onChangeText={setMaxParticipants}
              keyboardType="number-pad"
              placeholder="20"
            />
          </FieldLabel>

          <FieldLabel label="Notes (optional)">
            <Input
              value={notes}
              onChangeText={setNotes}
              placeholder="Any details for participants..."
              multiline
              numberOfLines={2}
              className="h-16"
              style={{ textAlignVertical: "top" }}
            />
          </FieldLabel>

          <Button onPress={handleCreate} disabled={loading} className="mt-2">
            {loading ? (
              <ActivityIndicator size="small" color={tokens.primaryForeground} />
            ) : (
              <Text className="text-sm font-medium text-primary-foreground">Create Session</Text>
            )}
          </Button>
        </View>
      </SheetContent>
    </Sheet>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
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
      {options.map((o) => (
        <Button
          key={String(o.value)}
          variant={selected === o.value ? "default" : "outline"}
          size="sm"
          onPress={() => onSelect(o.value)}
          className="flex-1"
        >
          {o.label}
        </Button>
      ))}
    </View>
  );
}
