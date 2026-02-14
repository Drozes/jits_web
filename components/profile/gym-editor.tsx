"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";

interface Gym {
  id: string;
  name: string;
}

interface GymEditorProps {
  athleteId: string;
  initialGymId: string | null;
  initialGymName: string | null;
}

export function GymEditor({
  athleteId,
  initialGymId,
  initialGymName,
}: GymEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [selectedGymId, setSelectedGymId] = useState(initialGymId ?? "");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("gyms")
      .select("id, name")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => {
        setGyms(data ?? []);
        setLoading(false);
      });
  }, [isEditing]);

  const handleSave = async () => {
    const gymId = selectedGymId || null;

    if (gymId === initialGymId) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("athletes")
      .update({ primary_gym_id: gymId })
      .eq("id", athleteId);

    setSaving(false);

    if (error) {
      setSelectedGymId(initialGymId ?? "");
    } else {
      router.refresh();
    }

    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Select
          value={selectedGymId}
          onValueChange={setSelectedGymId}
          disabled={loading || saving}
        >
          <SelectTrigger className="w-48 text-sm">
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
        <Button size="sm" onClick={handleSave} disabled={saving || loading}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelectedGymId(initialGymId ?? "");
            setIsEditing(false);
          }}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="group flex items-center gap-1.5 text-left"
    >
      <span className="text-sm text-muted-foreground">
        {initialGymName ?? "Set gym"}
      </span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
