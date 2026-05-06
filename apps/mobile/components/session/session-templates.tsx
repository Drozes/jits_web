import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { CalendarClock, Plus } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { getSessionTemplates } from "@jits/shared/api/queries";
import type { SessionTemplate } from "@jits/shared/types/session";
import { TemplateCard } from "./template-card";
import { TemplateFormSheet } from "./template-form-sheet";

interface SessionTemplatesProps {
  gymId: string;
  isManager: boolean;
}

export function SessionTemplates({ gymId, isManager }: SessionTemplatesProps) {
  const tokens = useThemedTokens();
  const [templates, setTemplates] = React.useState<SessionTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchTemplates = React.useCallback(async () => {
    const data = await getSessionTemplates(supabase, gymId);
    setTemplates(data.filter((t) => t.is_active));
    setLoading(false);
  }, [gymId]);

  React.useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  if (loading) {
    return (
      <View className="py-4 items-center">
        <ActivityIndicator size="small" color={tokens.primary} />
      </View>
    );
  }

  return (
    <View className="gap-3">
      <TemplatesHeader
        count={templates.length}
        isManager={isManager}
        gymId={gymId}
        onSaved={fetchTemplates}
        tokens={tokens}
      />
      {templates.length > 0 ? (
        <View className="gap-2">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              isManager={isManager}
              gymId={gymId}
              onChanged={fetchTemplates}
            />
          ))}
        </View>
      ) : (
        <View className="rounded-md border border-dashed border-border p-6 items-center">
          <Text className="text-sm text-muted-foreground">No session templates yet</Text>
        </View>
      )}
    </View>
  );
}

function TemplatesHeader({
  count,
  isManager,
  gymId,
  onSaved,
  tokens,
}: {
  count: number;
  isManager: boolean;
  gymId: string;
  onSaved: () => void;
  tokens: ReturnType<typeof useThemedTokens>;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        <CalendarClock size={18} color={tokens.primary} />
        <Text className="text-lg font-heading text-foreground">Templates</Text>
        {count > 0 ? (
          <View className="px-2 py-0.5 rounded-full bg-muted">
            <Text className="text-[11px] font-mono text-muted-foreground">{count}</Text>
          </View>
        ) : null}
      </View>
      {isManager ? (
        <TemplateFormSheet gymId={gymId} onSaved={onSaved}>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} color={tokens.foreground} />}
          >
            Add
          </Button>
        </TemplateFormSheet>
      ) : null}
    </View>
  );
}
