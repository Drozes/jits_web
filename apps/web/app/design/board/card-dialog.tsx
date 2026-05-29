"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatRelativeDate } from "@jits/shared/utils";
import type { AdminCard } from "@jits/shared/api/queries";

interface Props {
  card: AdminCard;
  /** Persist the edit. Resolves to an error message, or null on success. */
  onSave: (patch: { title: string; notes: string | null }) => Promise<string | null>;
  onClose: () => void;
}

const STATUS_LABEL: Record<AdminCard["status"], string> = {
  todo: "To Do",
  doing: "Doing",
  done: "Done",
};

export function CardDialog({ card, onSave, onClose }: Props) {
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const err = await onSave({ title: title.trim(), notes: notes.trim() || null });
    if (err) {
      setError(err);
      setSaving(false);
    }
    // On success the parent unmounts this dialog.
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Card</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-title">Title</Label>
            <Input
              id="card-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-notes">Description</Label>
            <textarea
              id="card-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="Add more detail…"
              className="rounded-sm border border-border bg-background px-3 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-body text-xs text-muted-foreground">
            <span>
              Status:{" "}
              <span className="text-foreground">{STATUS_LABEL[card.status]}</span>
            </span>
            <span>
              Created:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatRelativeDate(card.created_at)}
              </span>
            </span>
            <span>
              Updated:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatRelativeDate(card.updated_at)}
              </span>
            </span>
          </div>
          {error && (
            <p className="font-body text-sm text-primary">{error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
