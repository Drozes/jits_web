"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DisplayNameEditorProps {
  athleteId: string;
  initialName: string;
}

export function DisplayNameEditor({
  athleteId,
  initialName,
}: DisplayNameEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || name === initialName) {
      setName(initialName);
      setIsEditing(false);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("athletes")
      .update({ display_name: name.trim() })
      .eq("id", athleteId);

    setSaving(false);

    if (error) {
      setName(initialName);
    } else {
      router.refresh();
    }

    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setName(initialName);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="max-w-xs text-lg font-semibold"
          disabled={saving}
        />
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setName(initialName);
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
      className="group flex items-center gap-2 text-left"
    >
      <h2 className="text-2xl font-bold tracking-tight">{name}</h2>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      >
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      </svg>
    </button>
  );
}
