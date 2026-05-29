"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

export function AddCardInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const title = value.trim();
    if (!title) return;
    onAdd(title);
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a card…"
        className="min-w-0 flex-1 rounded-sm border border-border bg-background px-2 py-1.5 font-body text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Add card"
        className="shrink-0 rounded-sm border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus size={16} />
      </button>
    </form>
  );
}
