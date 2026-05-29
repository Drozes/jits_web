import * as React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Plate } from "@/components/ui/elo-system";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { updateGym } from "@jits/shared/api/mutations";

interface EditGymSheetProps {
  gymId: string;
  currentName: string;
  currentCity: string | null;
  onUpdated: () => void;
  children: React.ReactElement;
}

export function EditGymSheet({
  gymId,
  currentName,
  currentCity,
  onUpdated,
  children,
}: EditGymSheetProps) {
  const tokens = useThemedTokens();
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState(currentName);
  const [city, setCity] = React.useState(currentCity ?? "");

  async function handleSave() {
    if (!name.trim()) return;
    setLoading(true);

    const result = await updateGym(supabase, gymId, {
      name: name.trim(),
      city: city.trim() || undefined,
    });

    if (result.ok) {
      toast.success("Gym updated");
      onUpdated();
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  const isValid = name.trim().length > 0;

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent snapPoints={["55%"]}>
        <SheetHeader>
          <SheetTitle className="font-heading text-[18px] text-ink uppercase tracking-caps">
            Edit Gym
          </SheetTitle>
        </SheetHeader>

        <Plate className="gap-4 mt-2">
          <FieldLabeled label="Gym Name">
            <ElevatedInput value={name} onChangeText={setName} tokens={tokens} />
          </FieldLabeled>
          <FieldLabeled label="City">
            <ElevatedInput value={city} onChangeText={setCity} tokens={tokens} />
          </FieldLabeled>
        </Plate>

        <Pressable
          onPress={handleSave}
          disabled={loading || !isValid}
          accessibilityRole="button"
          className={
            loading || !isValid
              ? "mt-4 bg-cta rounded-sm py-3 px-5 items-center justify-center opacity-50"
              : "mt-4 bg-cta rounded-sm py-3 px-5 items-center justify-center active:bg-cta-hover"
          }
        >
          {loading ? (
            <ActivityIndicator size="small" color={tokens.textOnAccent} />
          ) : (
            <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
              Save Changes
            </Text>
          )}
        </Pressable>
      </SheetContent>
    </Sheet>
  );
}

function FieldLabeled({ label, children }: { label: string; children: React.ReactNode }) {
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
  ...props
}: React.ComponentProps<typeof TextInput> & {
  tokens: ReturnType<typeof useThemedTokens>;
}) {
  return (
    <TextInput
      placeholderTextColor={tokens.textTertiary}
      className="h-11 px-4 rounded-xs bg-surface-4 border border-hairline text-ink font-mono text-[14px]"
      {...props}
    />
  );
}
