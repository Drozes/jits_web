import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Play, Pencil, Trash2 } from "lucide-react-native";
import { Plate } from "@/components/ui/elo-system";
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
  const meta = `${DAYS[template.day_of_week]} · ${timeDisplay} · ${template.duration_minutes}m${
    template.max_participants ? ` · Max ${template.max_participants}` : ""
  }`;

  return (
    <Plate>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 min-w-0 gap-1">
          <Text
            className="font-heading text-[14px] text-ink"
            numberOfLines={1}
          >
            {template.title}
          </Text>
          <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
            {meta}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <IconButton
            onPress={handleCreateSession}
            disabled={creating}
            ariaLabel="Start session from template"
          >
            {creating ? (
              <ActivityIndicator size={14} color={tokens.textSecondary} />
            ) : (
              <Play size={14} color={tokens.textSecondary} />
            )}
          </IconButton>
          {isManager ? (
            <>
              <TemplateFormSheet gymId={gymId} template={template} onSaved={onChanged}>
                <IconButton ariaLabel="Edit template">
                  <Pencil size={14} color={tokens.textSecondary} />
                </IconButton>
              </TemplateFormSheet>
              <IconButton
                onPress={handleDelete}
                disabled={deleting}
                ariaLabel="Delete template"
                tone="danger"
              >
                {deleting ? (
                  <ActivityIndicator size={14} color={tokens.stateNegative} />
                ) : (
                  <Trash2 size={14} color={tokens.stateNegative} />
                )}
              </IconButton>
            </>
          ) : null}
        </View>
      </View>
    </Plate>
  );
}

interface IconButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  ariaLabel: string;
  tone?: "danger";
}

function IconButton({ children, onPress, disabled, ariaLabel, tone }: IconButtonProps) {
  // Border tone differentiates destructive (delete) from neutral icon buttons.
  // We intentionally keep the surface the same so the action stays subdued.
  const base =
    "w-8 h-8 items-center justify-center rounded-xs bg-surface-4 active:bg-surface-3";
  const borderClass =
    tone === "danger" ? "border border-negative" : "border border-hairline";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={ariaLabel}
      className={[base, borderClass, disabled ? "opacity-50" : ""].join(" ")}
    >
      {children}
    </Pressable>
  );
}
