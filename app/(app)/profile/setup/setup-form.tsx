"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Laptop } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SetupFormProps {
  athleteId: string | null;
  defaultDisplayName: string;
  gyms: { id: string; name: string }[];
}

export function SetupForm({ athleteId, defaultDisplayName, gyms }: SetupFormProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [weight, setWeight] = useState("");
  const [gymId, setGymId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = displayName.trim();
    if (!trimmed) {
      setError("Display name is required");
      return;
    }

    const parsedWeight = weight ? parseFloat(weight) : null;
    if (!parsedWeight || parsedWeight < 50 || parsedWeight > 400) {
      setError("Please enter a valid weight between 50 and 400 lbs");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();

    if (athleteId) {
      // Update existing athlete record (auto-created by backend)
      const { error: updateError } = await supabase
        .from("athletes")
        .update({
          display_name: trimmed,
          current_weight: parsedWeight,
          primary_gym_id: gymId,
        })
        .eq("id", athleteId);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
    } else {
      // Fallback: insert if no athlete record exists yet
      const { error: insertError } = await supabase.from("athletes").insert({
        display_name: trimmed,
        current_weight: parsedWeight,
        primary_gym_id: gymId,
      });

      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }
    }

    router.push("/");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              placeholder="Enter your fighter name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              This is how other athletes will see you. You can change it later.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="weight">Weight (lbs)</Label>
            <Input
              id="weight"
              type="number"
              placeholder="e.g. 155"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              min={50}
              max={400}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground">
              Used for weight class matching.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Gym</Label>
            <Select value={gymId} onValueChange={setGymId}>
              <SelectTrigger>
                <SelectValue placeholder="Select your gym" />
              </SelectTrigger>
              <SelectContent>
                {gyms.map((gym) => (
                  <SelectItem key={gym.id} value={gym.id}>
                    {gym.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Required to activate your profile and appear to other athletes.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Theme</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Laptop },
              ] as const).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors ${
                    theme === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              You can change this later in your profile settings.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading || !displayName.trim() || !weight || !gymId}
          >
            {loading ? "Saving..." : "Get Started"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
