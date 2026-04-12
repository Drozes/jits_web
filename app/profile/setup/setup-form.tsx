"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
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
import { ProfilePhotoUpload } from "@/components/profile/profile-photo-upload";
import { ThemePicker } from "./theme-picker";
import { TosStep } from "./tos-step";

interface SetupFormProps {
  athleteId: string | null;
  defaultDisplayName: string;
  defaultWeight?: string;
  defaultGymId?: string;
  defaultGender?: string;
  defaultDateOfBirth?: string;
  defaultCity?: string;
  defaultProfilePhotoUrl?: string | null;
  gyms: { id: string; name: string }[];
  isEditing?: boolean;
  hasAcceptedTos?: boolean;
  waiverId?: string;
}

export function SetupForm({
  athleteId,
  defaultDisplayName,
  defaultWeight = "",
  defaultGymId = "",
  defaultGender = "",
  defaultDateOfBirth = "",
  defaultCity = "",
  defaultProfilePhotoUrl = null,
  gyms,
  isEditing = false,
  hasAcceptedTos = false,
  waiverId,
}: SetupFormProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [step, setStep] = useState<1 | 2>(hasAcceptedTos ? 2 : 1);
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [weight, setWeight] = useState(defaultWeight);
  const [gymId, setGymId] = useState(defaultGymId);
  const [gender, setGender] = useState(defaultGender);
  const [dateOfBirth, setDateOfBirth] = useState(defaultDateOfBirth);
  const [city, setCity] = useState(defaultCity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTosAccept() {
    if (athleteId && waiverId) {
      const supabase = createClient();
      const { error: tosError } = await supabase.from("waiver_acknowledgements").insert({
        athlete_id: athleteId,
        waiver_id: waiverId,
      });
      if (tosError) {
        setError("Failed to save Terms of Service acceptance. Please try again.");
        return;
      }
    }
    setStep(2);
  }

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

    if (!gender) {
      setError("Gender is required");
      return;
    }

    if (!dateOfBirth) {
      setError("Date of birth is required");
      return;
    }

    const dob = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();
    const hasBirthdayPassed =
      today.getMonth() > dob.getMonth() ||
      (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
    if ((hasBirthdayPassed ? age : age - 1) < 16) {
      setError("You must be at least 16 years old to compete");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const payload = {
      display_name: trimmed,
      current_weight: parsedWeight,
      primary_gym_id: gymId,
      gender,
      date_of_birth: dateOfBirth || null,
      city: city.trim() || null,
    };

    if (athleteId) {
      const { error: updateError } = await supabase
        .from("athletes")
        .update(payload)
        .eq("id", athleteId);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("athletes")
        .insert(payload);

      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }
    }

    const { data: updated } = await supabase
      .from("athletes")
      .select("status")
      .eq("id", athleteId!)
      .single();

    if (updated?.status !== "active") {
      setError("Profile saved but activation failed. Please try again.");
      setLoading(false);
      return;
    }

    if (isEditing) {
      toast.success("Profile updated successfully");
      router.push("/profile");
    } else {
      window.location.href = "/";
    }
  }

  if (step === 1) {
    return (
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Terms of Service</h2>
          <TosStep onAccept={handleTosAccept} />
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isEditing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 -mt-2 mb-1 w-fit"
              onClick={() => router.back()}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          )}

          {athleteId && (
            <ProfilePhotoUpload
              athleteId={athleteId}
              displayName={displayName}
              profilePhotoUrl={defaultProfilePhotoUrl}
            />
          )}

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
              <SelectTrigger className="w-full">
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
            <Label>Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Male</SelectItem>
                <SelectItem value="F">Female</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for competition brackets.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              You must be at least 16 to compete.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              placeholder="e.g. Austin, TX"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Helps you find local sessions and gyms.
            </p>
          </div>

          <ThemePicker theme={theme} onThemeChange={setTheme} />

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            disabled={
              loading ||
              !displayName.trim() ||
              !weight ||
              !gymId ||
              !gender ||
              !dateOfBirth
            }
          >
            {loading ? "Saving..." : isEditing ? "Save Changes" : "Get Started"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
