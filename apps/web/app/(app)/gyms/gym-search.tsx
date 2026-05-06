"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { GymCard } from "@/components/domain/gym-card";
import type { GymListItem } from "@jits/shared/types/session";
import { CreateGymDialog } from "./create-gym-dialog";

interface GymSearchProps {
  gyms: GymListItem[];
  myGymId: string | null;
}

export function GymSearch({ gyms, myGymId }: GymSearchProps) {
  const [query, setQuery] = useState("");

  const filtered = gyms.filter((g) => {
    const q = query.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      (g.city && g.city.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search gyms..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <CreateGymDialog />
      </div>

      {filtered.length > 0 ? (
        <div className="flex flex-col gap-3">
          {filtered.map((gym) => (
            <GymCard key={gym.id} gym={gym} isMyGym={gym.id === myGymId} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No gyms found</p>
        </div>
      )}
    </div>
  );
}
