import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Play, Pencil, Trash2 } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { deleteSessionTemplate, createSessionFromTemplate } from "@jits/shared/api/mutations";
import type { SessionTemplate } from "@jits/shared/types/session";
import { TemplateFormSheet } from "./template-form-sheet";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface TemplateCardProps {
  template: SessionTemplate;
  isManager: boolean;
  gymId: string;
  onChanged: () => void;
}

export function TemplateCard({ template, isManager, gymId, onChanged }: TemplateCardProps) {
  const tokens = useThemedTokens();
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function handleCreateSession() {
    setCreating(true);
    const result = await createSessionFromTemplate(supabase, template.id);
    if (result.ok) {
      toast.success("Session created from template");
      onChanged();
    } else {
      toast.error(result.error.message);
    }
    setCreating(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteSessionTemplate(supabase, template.id);
    if (result.ok) {
      toast.success("Template deleted");
      onChanged();
    } else {
      toast.error(result.error.message);
    }
    setDeleting(false);
  }

  const timeDisplay = template.start_time.slice(0, 5);

  return (
    <Card className="p-3">
      <View className="flex-row items-center justify-between gap-3">
        <TemplateInfo title={template.title} day={DAYS[template.day_of_week]} time={timeDisplay} duration={template.duration_minutes} max={template.max_participants} />
        <TemplateActions
          template={template}
          isManager={isManager}
          gymId={gymId}
          creating={creating}
          deleting={deleting}
          onCreateSession={handleCreateSession}
          onDelete={handleDelete}
          onChanged={onChanged}
          tokens={tokens}
        />
      </View>
    </Card>
  );
}

function TemplateInfo({ title, day, time, duration, max }: { title: string; day: string; time: string; duration: number; max: number | null }) {
  return (
    <View className="flex-1 min-w-0 gap-0.5">
      <Text className="text-sm font-heading text-foreground" numberOfLines={1}>{title}</Text>
      <Text className="text-xs font-mono text-muted-foreground">{day} at {time} ({duration}min)</Text>
      {max ? <Text className="text-xs text-muted-foreground">Max {max}</Text> : null}
    </View>
  );
}

function TemplateActions({ template, isManager, gymId, creating, deleting, onCreateSession, onDelete, onChanged, tokens }: { template: SessionTemplate; isManager: boolean; gymId: string; creating: boolean; deleting: boolean; onCreateSession: () => void; onDelete: () => void; onChanged: () => void; tokens: ReturnType<typeof useThemedTokens> }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Button size="sm" variant="outline" onPress={onCreateSession} disabled={creating}>
        {creating ? <ActivityIndicator size={14} color={tokens.foreground} /> : <Play size={14} color={tokens.foreground} />}
      </Button>
      {isManager ? (
        <>
          <TemplateFormSheet gymId={gymId} template={template} onSaved={onChanged}>
            <Button size="sm" variant="ghost">
              <Pencil size={14} color={tokens.foreground} />
            </Button>
          </TemplateFormSheet>
          <Button size="sm" variant="ghost" onPress={onDelete} disabled={deleting}>
            {deleting ? <ActivityIndicator size={14} color={tokens.foreground} /> : <Trash2 size={14} color={tokens.foreground} />}
          </Button>
        </>
      ) : null}
    </View>
  );
}
