"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatRelativeDate } from "@jits/shared/utils";
import type { AdminCard } from "@jits/shared/api/queries";

interface Props {
  card: AdminCard;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onOpen: () => void;
}

export function KanbanCard({
  card,
  canMoveLeft,
  canMoveRight,
  onMove,
  onDelete,
  onOpen,
}: Props) {
  return (
    <div className="group rounded-sm border border-border bg-background p-3 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block font-body text-sm text-foreground">
            {card.title}
          </span>
          {card.notes && (
            <span className="mt-1 block truncate font-body text-xs text-muted-foreground">
              {card.notes}
            </span>
          )}
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete card"
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
        >
          <X size={15} />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
        <button
          onClick={() => onMove(-1)}
          disabled={!canMoveLeft}
          aria-label="Move left"
          className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={!canMoveRight}
          aria-label="Move right"
          className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight size={15} />
        </button>
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {formatRelativeDate(card.updated_at)}
        </span>
      </div>
    </div>
  );
}
