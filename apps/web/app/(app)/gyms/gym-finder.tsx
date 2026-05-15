"use client";

import { useMemo, useState } from "react";
import type { GymListItem } from "@jits/shared/types/session";
import { GymRow } from "./gym-row";
import { CreateGymDialog } from "./create-gym-dialog";

interface GymFinderProps {
  gyms: GymListItem[];
  myGymId: string | null;
  defaultCity: string | null;
}

const ALL_CITIES = "All Cities";

export function GymFinder({ gyms, myGymId, defaultCity }: GymFinderProps) {
  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const g of gyms) {
      if (g.city) set.add(g.city);
    }
    return Array.from(set).sort();
  }, [gyms]);

  const initial = defaultCity && cities.includes(defaultCity) ? defaultCity : ALL_CITIES;
  const [city, setCity] = useState<string>(initial);

  const filtered = useMemo(() => {
    if (city === ALL_CITIES) return gyms;
    return gyms.filter((g) => (g.city ?? "") === city);
  }, [city, gyms]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <CityField value={city} onChange={setCity} cities={cities} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps-xl)",
            fontWeight: 700,
          }}
        >
          {filtered.length} Partner {filtered.length === 1 ? "Gym" : "Gyms"}
        </span>
        <CreateGymDialog />
      </div>

      {filtered.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {filtered.map((gym) => {
            const schedule = gym.hasActiveSession
              ? null
              : gym.upcomingSessions > 0
                ? `${gym.upcomingSessions} Upcoming`
                : null;
            return (
              <GymRow
                key={gym.id}
                gym={gym}
                isMyGym={gym.id === myGymId}
                scheduleLabel={schedule}
              />
            );
          })}
        </div>
      ) : (
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px dashed var(--border-hairline)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-8)",
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-xs)",
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps-l)",
            color: "var(--text-tertiary)",
          }}
        >
          No Gyms Found
        </div>
      )}
    </div>
  );
}

function CityField({
  value,
  onChange,
  cities,
}: {
  value: string;
  onChange: (v: string) => void;
  cities: string[];
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--size-num-xs)",
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-caps-xl)",
          fontWeight: 700,
        }}
      >
        City
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-hairline)",
          borderRadius: "var(--radius-xs)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--size-num-m)",
          letterSpacing: "var(--ls-caps-l)",
          textTransform: "uppercase",
          padding: "var(--space-3) var(--space-4)",
          cursor: "pointer",
          width: "100%",
        }}
      >
        <option value={ALL_CITIES}>{ALL_CITIES}</option>
        {cities.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
