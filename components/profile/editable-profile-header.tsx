"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EloBadge } from "@/components/domain/elo-badge";
import { ProfilePhotoUpload } from "@/components/profile/profile-photo-upload";
import { Pencil } from "lucide-react";
import type { Athlete } from "@/types/athlete";

interface EditableProfileHeaderProps {
  athlete: Athlete;
  gymName: string | null;
  stats: { wins: number; losses: number; winRate: number };
}

type EditingField = "name" | "weight" | "gym" | null;

export function EditableProfileHeader({
  athlete,
  gymName,
  stats,
}: EditableProfileHeaderProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditingField>(null);
  const [saving, setSaving] = useState(false);

  // Name state
  const [name, setName] = useState(athlete.display_name);

  // Weight state
  const [weight, setWeight] = useState(athlete.current_weight?.toString() ?? "");

  // Gym state
  const [gyms, setGyms] = useState<{ id: string; name: string }[]>([]);
  const [selectedGymId, setSelectedGymId] = useState(athlete.primary_gym_id ?? "");
  const [loadingGyms, setLoadingGyms] = useState(false);

  useEffect(() => {
    if (editing !== "gym") return;
    setLoadingGyms(true);
    const supabase = createClient();
    supabase
      .from("gyms")
      .select("id, name")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => {
        setGyms(data ?? []);
        setLoadingGyms(false);
      });
  }, [editing]);

  const cancelEdit = () => {
    setName(athlete.display_name);
    setWeight(athlete.current_weight?.toString() ?? "");
    setSelectedGymId(athlete.primary_gym_id ?? "");
    setEditing(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") cancelEdit();
  };

  const handleSave = async () => {
    const supabase = createClient();
    setSaving(true);

    let updateData: Record<string, unknown> = {};

    if (editing === "name") {
      const trimmed = name.trim();
      if (!trimmed || trimmed === athlete.display_name) {
        cancelEdit();
        setSaving(false);
        return;
      }
      updateData = { display_name: trimmed };
    } else if (editing === "weight") {
      const parsed = weight.trim() ? parseFloat(weight) : null;
      if (parsed !== null && (isNaN(parsed) || parsed <= 0 || parsed > 500)) {
        cancelEdit();
        setSaving(false);
        return;
      }
      if (parsed === athlete.current_weight) {
        setEditing(null);
        setSaving(false);
        return;
      }
      updateData = { current_weight: parsed };
    } else if (editing === "gym") {
      const gymId = selectedGymId || null;
      if (gymId === athlete.primary_gym_id) {
        setEditing(null);
        setSaving(false);
        return;
      }
      updateData = { primary_gym_id: gymId };
    }

    const { error } = await supabase
      .from("athletes")
      .update(updateData)
      .eq("id", athlete.id);

    setSaving(false);

    if (error) {
      cancelEdit();
    } else {
      setEditing(null);
      router.refresh();
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <ProfilePhotoUpload
            athleteId={athlete.id}
            displayName={athlete.display_name}
            profilePhotoUrl={athlete.profile_photo_url}
            showLabel={false}
            onPhotoChange={() => router.refresh()}
          />

          <div className="flex-1 min-w-0">
            <NameField
              editing={editing === "name"}
              name={name}
              saving={saving}
              onEdit={() => setEditing("name")}
              onChange={setName}
              onKeyDown={handleKeyDown}
              onSave={handleSave}
              onCancel={cancelEdit}
            />

            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">
                ELO <EloBadge elo={athlete.current_elo} variant="compact" />
              </span>
            </div>

            {athlete.highest_elo > athlete.current_elo && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Peak: {athlete.highest_elo}
              </p>
            )}

            <GymField
              editing={editing === "gym"}
              gymName={gymName}
              gyms={gyms}
              selectedGymId={selectedGymId}
              saving={saving}
              loading={loadingGyms}
              onEdit={() => setEditing("gym")}
              onSelect={setSelectedGymId}
              onSave={handleSave}
              onCancel={cancelEdit}
            />

            <WeightField
              editing={editing === "weight"}
              weight={weight}
              initialWeight={athlete.current_weight}
              saving={saving}
              onEdit={() => setEditing("weight")}
              onChange={setWeight}
              onKeyDown={handleKeyDown}
              onSave={handleSave}
              onCancel={cancelEdit}
            />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-500 tabular-nums">
              {stats.wins}
            </p>
            <p className="text-xs text-muted-foreground">Wins</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-500 tabular-nums">
              {stats.losses}
            </p>
            <p className="text-xs text-muted-foreground">Losses</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{stats.winRate}%</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NameField({
  editing,
  name,
  saving,
  onEdit,
  onChange,
  onKeyDown,
  onSave,
  onCancel,
}: {
  editing: boolean;
  name: string;
  saving: boolean;
  onEdit: () => void;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          className="max-w-[160px] text-sm font-semibold h-8"
          disabled={saving}
        />
        <SaveCancelButtons saving={saving} onSave={onSave} onCancel={onCancel} />
      </div>
    );
  }

  return (
    <button onClick={onEdit} className="group flex items-center gap-2 text-left">
      <h2 className="text-xl font-bold tracking-tight truncate">{name}</h2>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
    </button>
  );
}

function GymField({
  editing,
  gymName,
  gyms,
  selectedGymId,
  saving,
  loading,
  onEdit,
  onSelect,
  onSave,
  onCancel,
}: {
  editing: boolean;
  gymName: string | null;
  gyms: { id: string; name: string }[];
  selectedGymId: string;
  saving: boolean;
  loading: boolean;
  onEdit: () => void;
  onSelect: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-0.5">
        <Select
          value={selectedGymId}
          onValueChange={onSelect}
          disabled={loading || saving}
        >
          <SelectTrigger className="w-40 text-xs h-8">
            <SelectValue placeholder={loading ? "Loading..." : "Select gym"} />
          </SelectTrigger>
          <SelectContent>
            {gyms.map((gym) => (
              <SelectItem key={gym.id} value={gym.id}>
                {gym.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SaveCancelButtons saving={saving || loading} onSave={onSave} onCancel={onCancel} />
      </div>
    );
  }

  return (
    <button onClick={onEdit} className="group flex items-center gap-1.5 text-left mt-0.5">
      <span className="text-sm text-muted-foreground truncate">
        {gymName ?? "Set gym"}
      </span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
    </button>
  );
}

function WeightField({
  editing,
  weight,
  initialWeight,
  saving,
  onEdit,
  onChange,
  onKeyDown,
  onSave,
  onCancel,
}: {
  editing: boolean;
  weight: string;
  initialWeight: number | null;
  saving: boolean;
  onEdit: () => void;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-0.5">
        <Input
          type="number"
          value={weight}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          placeholder="lbs"
          className="w-20 text-xs h-8"
          min={1}
          max={500}
          step="0.1"
          disabled={saving}
        />
        <span className="text-xs text-muted-foreground">lbs</span>
        <SaveCancelButtons saving={saving} onSave={onSave} onCancel={onCancel} />
      </div>
    );
  }

  return (
    <button onClick={onEdit} className="group flex items-center gap-1.5 text-left mt-0.5">
      <span className="text-sm text-muted-foreground">
        {initialWeight ? `${initialWeight} lbs` : "Set weight"}
      </span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
    </button>
  );
}

function SaveCancelButtons({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <Button size="sm" onClick={onSave} disabled={saving} className="h-7 text-xs px-2">
        {saving ? "..." : "Save"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving} className="h-7 text-xs px-2">
        Cancel
      </Button>
    </>
  );
}
