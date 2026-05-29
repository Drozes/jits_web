"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createAdminCard,
  updateAdminCard,
  deleteAdminCard,
} from "@jits/shared/api/mutations";
import type { AdminCard, AdminCardStatus } from "@jits/shared/api/queries";
import { KanbanCard } from "./kanban-card";
import { AddCardInput } from "./add-card-input";

const COLUMNS: { status: AdminCardStatus; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "doing", label: "Doing" },
  { status: "done", label: "Done" },
];

export function KanbanBoard({ initialCards }: { initialCards: AdminCard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [error, setError] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());

  async function handleAdd(status: AdminCardStatus, title: string) {
    setError(null);
    const result = await createAdminCard(supabase, { title, status });
    if (!result.ok) return setError(result.error.message);
    setCards((prev) => [...prev, result.data]);
  }

  async function handleMove(card: AdminCard, dir: -1 | 1) {
    setError(null);
    const idx = COLUMNS.findIndex((c) => c.status === card.status);
    const next = COLUMNS[idx + dir];
    if (!next) return;
    const result = await updateAdminCard(supabase, card.id, {
      status: next.status,
    });
    if (!result.ok) return setError(result.error.message);
    setCards((prev) => prev.map((c) => (c.id === card.id ? result.data : c)));
  }

  async function handleDelete(id: string) {
    setError(null);
    const result = await deleteAdminCard(supabase, id);
    if (!result.ok) return setError(result.error.message);
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-sm border border-primary/40 bg-primary/5 px-3 py-2 font-body text-sm text-primary">
          {error}. Are you signed in to ELO RATED in this browser?
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {COLUMNS.map((col, colIdx) => {
          const colCards = cards.filter((c) => c.status === col.status);
          return (
            <section
              key={col.status}
              className="flex flex-col gap-3 rounded-sm border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">
                  {col.label}
                </h2>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {colCards.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {colCards.map((card) => (
                  <KanbanCard
                    key={card.id}
                    card={card}
                    canMoveLeft={colIdx > 0}
                    canMoveRight={colIdx < COLUMNS.length - 1}
                    onMove={(dir) => handleMove(card, dir)}
                    onDelete={() => handleDelete(card.id)}
                  />
                ))}
              </div>
              <AddCardInput onAdd={(title) => handleAdd(col.status, title)} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
