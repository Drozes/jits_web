import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAdminCards } from "@jits/shared/api/queries";
import { KanbanBoard } from "./kanban-board";

export default function BoardPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2 pt-8">
        <h1 className="font-display text-5xl uppercase leading-none text-foreground sm:text-6xl">
          Founders Board
        </h1>
        <p className="max-w-2xl font-body text-lg text-muted-foreground">
          A lightweight shared task tracker. Cards sync to Supabase so you and
          your partner see the same board from any browser. This is the seed for
          a future admin dashboard (users, gym signups, tooling).
        </p>
      </header>
      <Suspense fallback={<BoardSkeleton />}>
        <BoardContent />
      </Suspense>
    </div>
  );
}

async function BoardContent() {
  const supabase = await createClient();
  const cards = await getAdminCards(supabase);
  return <KanbanBoard initialCards={cards} />;
}

function BoardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-64 animate-pulse rounded-sm border border-border bg-card"
        />
      ))}
    </div>
  );
}
