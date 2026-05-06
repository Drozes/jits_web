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

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent snapPoints={["50%"]}>
        <SheetHeader>
          <SheetTitle>Edit Gym</SheetTitle>
        </SheetHeader>

        <View className="gap-4">
          <View className="gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChangeText={setName} />
          </View>
          <View className="gap-1.5">
            <Label>City</Label>
            <Input value={city} onChangeText={setCity} />
          </View>
          <Button
            onPress={handleSave}
            disabled={loading || !name.trim()}
            className="mt-2"
          >
            {loading ? (
              <ActivityIndicator size="small" color={tokens.primaryForeground} />
            ) : (
              <Text className="text-sm font-medium text-primary-foreground">Save Changes</Text>
            )}
          </Button>
        </View>
      </SheetContent>
    </Sheet>
  );
}
