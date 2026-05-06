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
import { createGym } from "@jits/shared/api/mutations";

interface CreateGymSheetProps {
  onCreated: () => void;
  children: React.ReactElement;
}

export function CreateGymSheet({ onCreated, children }: CreateGymSheetProps) {
  const tokens = useThemedTokens();
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");

  async function handleCreate() {
    if (!name.trim() || !city.trim()) return;
    setLoading(true);

    const result = await createGym(supabase, {
      name: name.trim(),
      city: city.trim(),
    });

    if (result.ok) {
      toast.success("Gym created");
      setName("");
      setCity("");
      onCreated();
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
          <SheetTitle>Create Gym</SheetTitle>
        </SheetHeader>

        <View className="gap-4">
          <View className="gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="e.g. Gracie Barra Downtown"
            />
          </View>
          <View className="gap-1.5">
            <Label>City</Label>
            <Input
              value={city}
              onChangeText={setCity}
              placeholder="e.g. Austin, TX"
            />
          </View>
          <Button
            onPress={handleCreate}
            disabled={loading || !name.trim() || !city.trim()}
            className="mt-2"
          >
            {loading ? (
              <ActivityIndicator size="small" color={tokens.primaryForeground} />
            ) : (
              <Text className="text-sm font-medium text-primary-foreground">Create Gym</Text>
            )}
          </Button>
        </View>
      </SheetContent>
    </Sheet>
  );
}
