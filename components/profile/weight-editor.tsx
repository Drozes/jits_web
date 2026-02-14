"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface WeightEditorProps {
  athleteId: string;
  initialWeight: number | null;
}

export function WeightEditor({ athleteId, initialWeight }: WeightEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [weight, setWeight] = useState(initialWeight?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const parsed = weight.trim() ? parseFloat(weight) : null;

    if (parsed !== null && (isNaN(parsed) || parsed <= 0 || parsed > 500)) {
      setWeight(initialWeight?.toString() ?? "");
      setIsEditing(false);
      return;
    }

    if (parsed === initialWeight) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("athletes")
      .update({ current_weight: parsed })
      .eq("id", athleteId);

    setSaving(false);

    if (error) {
      setWeight(initialWeight?.toString() ?? "");
    } else {
      router.refresh();
    }

    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setWeight(initialWeight?.toString() ?? "");
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="Weight in lbs"
          className="w-28 text-sm"
          min={1}
          max={500}
          step="0.1"
          disabled={saving}
        />
        <span className="text-sm text-muted-foreground">lbs</span>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setWeight(initialWeight?.toString() ?? "");
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
        {initialWeight ? `${initialWeight} lbs` : "Set weight"}
      </span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
