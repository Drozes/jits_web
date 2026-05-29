import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
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
        <ActivityIndicator size="small" color={tokens.accentCta} />
      </View>
    );
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Session Templates {templates.length > 0 ? `· ${templates.length}` : ""}
        </Text>
        {isManager ? (
          <TemplateFormSheet gymId={gymId} onSaved={fetchTemplates}>
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center gap-1 px-3 py-1.5 rounded-xs border border-hairline-strong bg-surface-3 active:bg-surface-4"
            >
              <Plus size={12} color={tokens.textSecondary} />
              <Text className="font-heading text-[10px] text-ink-2 uppercase tracking-caps">
                Add
              </Text>
            </Pressable>
          </TemplateFormSheet>
        ) : null}
      </View>
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
        <View className="rounded-xs border border-dashed border-hairline p-4 bg-surface-3 items-center">
          <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
            No Session Templates Yet
          </Text>
        </View>
      )}
    </View>
  );
}
