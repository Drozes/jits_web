"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip, RankRow, LivePill } from "@/components/ui/elo-system";

interface RankedAthlete {
  id: string;
  rank: number;
  displayName: string;
  currentElo: number;
  eloTrend: "up" | "down" | "neutral";
  gymName?: string;
  profilePhotoUrl?: string;
  wins: number;
  losses: number;
  isCurrentUser: boolean;
  gender?: "M" | "F" | null;
}

interface RankedGym {
  id: string;
  rank: number;
  name: string;
  totalElo: number;
  averageElo: number;
  memberCount: number;
}

const FILTERS = ["Global", "My Gym", "−77 kg", "30-day", "Region"] as const;

function eloDelta(athlete: RankedAthlete): number {
  // Approximate delta from trend until backend supplies real 30-day delta.
  if (athlete.eloTrend === "up") return Math.max(1, athlete.wins - athlete.losses);
  if (athlete.eloTrend === "down") return -Math.max(1, athlete.losses - athlete.wins);
  return 0;
}

export function LeaderboardContent({
  athletes,
  gyms,
  challengedIds: _challengedIds = [],
}: {
  athletes: RankedAthlete[];
  gyms: RankedGym[];
  challengedIds?: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "gyms" ? "gyms" : "fighters";
  const isAthleteMode = mode === "fighters";
  const rawGender = searchParams.get("gender");
  const genderFilter: "all" | "male" | "female" =
    rawGender === "male" || rawGender === "female" ? rawGender : "all";

  const updateParam = useCallback(
    (key: string, value: string, defaultValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === defaultValue) params.delete(key);
      else params.set(key, value);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const filteredAthletes =
    genderFilter === "all"
      ? athletes
      : athletes.filter((a) => {
          if (genderFilter === "male") return a.gender === "M";
          if (genderFilter === "female") return a.gender === "F";
          return true;
        });

  const currentUser = filteredAthletes.find((a) => a.isCurrentUser);

  return (
    <div className="flex flex-col gap-6 animate-page-in" data-theme="dark" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", padding: "var(--space-4)", borderRadius: "var(--radius-md)" }}>
      {/* Mode toggle (kept compact) */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => updateParam("mode", "fighters", "fighters")}
          className={cn("px-3 py-1.5 text-xs font-bold uppercase tracking-wider")}
          style={{
            fontFamily: "var(--font-heading)",
            letterSpacing: "var(--ls-caps)",
            color: isAthleteMode ? "var(--text-primary)" : "var(--text-tertiary)",
            borderBottom: `2px solid ${isAthleteMode ? "var(--accent-cta)" : "transparent"}`,
          }}
        >
          Fighters
        </button>
        <button
          onClick={() => updateParam("mode", "gyms", "fighters")}
          className={cn("px-3 py-1.5 text-xs font-bold uppercase tracking-wider")}
          style={{
            fontFamily: "var(--font-heading)",
            letterSpacing: "var(--ls-caps)",
            color: !isAthleteMode ? "var(--text-primary)" : "var(--text-tertiary)",
            borderBottom: `2px solid ${!isAthleteMode ? "var(--accent-cta)" : "transparent"}`,
          }}
        >
          Gyms
        </button>
      </div>

      {isAthleteMode ? (
        <>
          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {FILTERS.map((label) => {
              const isGenderChip = false;
              const active = label === "Global" && genderFilter === "all" && !isGenderChip;
              return (
                <Chip key={label} active={active}>
                  {label}
                </Chip>
              );
            })}
            {/* Gender pills kept as functional sub-filter */}
            {(["all", "male", "female"] as const).map((g) => (
              <Chip
                key={g}
                active={genderFilter === g}
                onClick={() => updateParam("gender", g, "all")}
              >
                {g === "all" ? "All" : g === "male" ? "Men" : "Women"}
              </Chip>
            ))}
          </div>

          {/* Meta strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--size-num-xs)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "var(--ls-caps-xl)",
              paddingBottom: "var(--space-2)",
              borderBottom: "1px solid var(--border-hairline-faint)",
            }}
          >
            <span>
              <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                {filteredAthletes.length.toLocaleString()}
              </span>
              <span> · Athletes</span>
            </span>
            <LivePill />
          </div>

          {/* Ladder */}
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {filteredAthletes.map((a, i) => (
              <RankRow
                key={a.id}
                rank={i + 1}
                name={a.displayName}
                subtitle={a.gymName ?? "Free agent"}
                value={a.currentElo}
                delta={eloDelta(a)}
                leader={i === 0}
              />
            ))}
          </div>

          {filteredAthletes.length === 0 && (
            <p style={{ textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "var(--size-num-xs)", textTransform: "uppercase", letterSpacing: "var(--ls-caps-xl)" }}>
              No athletes found
            </p>
          )}

          {/* Sticky YOU */}
          {currentUser && (
            <div style={{ position: "sticky", bottom: 0, marginTop: "var(--space-4)" }}>
              <RankRow
                rank={currentUser.rank}
                name={currentUser.displayName}
                subtitle={currentUser.gymName ?? "Free agent"}
                value={currentUser.currentElo}
                delta={eloDelta(currentUser)}
                you
              />
            </div>
          )}
        </>
      ) : (
        <>
          {/* Gym Rankings (preserved legacy layout) */}
          <div className="flex flex-col gap-2.5">
            {gyms.map((gym) => (
              <Card key={gym.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="flex w-8 justify-center">
                      <span className="font-mono tabular-nums text-sm font-bold text-muted-foreground">#{gym.rank}</span>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border bg-gradient-to-br from-primary to-primary/80">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-[15px]">{gym.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {gym.memberCount} {gym.memberCount === 1 ? "athlete" : "athletes"} · Avg:{" "}
                        <span className="tabular-nums">{gym.averageElo}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold tabular-nums">{gym.totalElo}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {gyms.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">No gyms found</p>
          )}
        </>
      )}
    </div>
  );
}
