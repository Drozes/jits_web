"use client";

import * as React from "react";
import { ConceptFrame } from "./_frame";
import { SidebarHome } from "./concepts/sidebar-home";
import { TopnavRankings } from "./concepts/topnav-rankings";
import { ThreeColGyms } from "./concepts/three-col-gyms";
import { BentoProfile } from "./concepts/bento-profile";
import { SplitArena } from "./concepts/split-arena";
import { StravaFeed } from "./concepts/strava-feed";
import { EspnScores } from "./concepts/espn-scores";

type Concept = {
  key: string;
  label: string;
  screen: string;
  url: string;
  blurb: string;
  pros: string;
  cons: string;
  /** True for the direction that has shipped as the real authed web shell. */
  shipped?: boolean;
  Component: React.ComponentType;
};

const CONCEPTS: Concept[] = [
  {
    key: "sidebar",
    label: "Persistent Sidebar",
    screen: "Home / Dashboard",
    url: "elorated.com/home",
    blurb:
      "Classic SaaS shell. A fixed left nav rail replaces the bottom tab bar; the dashboard spreads into a two-column layout.",
    pros: "Most natural migration from the bottom nav · scales to many destinations · familiar.",
    cons: "Nav rail eats horizontal space on smaller laptops.",
    shipped: true,
    Component: SidebarHome,
  },
  {
    key: "topnav",
    label: "Top Nav + Wide",
    screen: "Rankings",
    url: "elorated.com/rankings",
    blurb:
      "Horizontal top bar with wordmark, primary nav, and profile. Content is centered at a comfortable max width with the ladder front-and-center.",
    pros: "Lightest lift · familiar marketing-site feel · maximizes vertical reading space.",
    cons: "Less room for persistent secondary panels.",
    Component: TopnavRankings,
  },
  {
    key: "threecol",
    label: "Three-Column",
    screen: "Gyms",
    url: "elorated.com/gyms",
    blurb:
      "Nav rail · main list · contextual right rail. Selecting a gym fills the detail panel without leaving the page.",
    pros: "Highest information density · master/detail keeps context · great for browsing.",
    cons: "Demands wide screens; busiest of the six.",
    Component: ThreeColGyms,
  },
  {
    key: "bento",
    label: "Bento Grid",
    screen: "Profile",
    url: "elorated.com/profile",
    blurb:
      "Modular cards (ELO hero, record, stat tiles, recent matches) tiled in an asymmetric grid for a visual command-center feel.",
    pros: "Modern and scannable · easy to reorder/add widgets · strong visual hierarchy.",
    cons: "Grid balance needs care as content varies.",
    Component: BentoProfile,
  },
  {
    key: "split",
    label: "Split-Screen Arena",
    screen: "Arena · Live",
    url: "elorated.com/arena",
    blurb:
      "A bold 55/45 immersive vertical split: the left pane is a featured live-matchup hero, the right is an actionable 'available now' matchmaking list.",
    pros: "Cinematic and distinctive · pairs a focal hero with a clear action surface.",
    cons: "Editorial style fits live/arena better than dense list screens.",
    Component: SplitArena,
  },
  {
    key: "strava",
    label: "Activity Feed",
    screen: "Home · Activity (Strava-style)",
    url: "elorated.com/feed",
    blurb:
      "Strava-inspired social feed: a left profile rail, a centered column of training/match cards with kudos and comments, and a right rail with your weekly summary and suggested athletes.",
    pros: "Drives engagement and retention · social proof · familiar fitness-app feel.",
    cons: "Feed-first puts ratings/matchmaking one layer deeper.",
    Component: StravaFeed,
  },
  {
    key: "espn",
    label: "Scores + News",
    screen: "Home · Live (ESPN-style)",
    url: "elorated.com/scores",
    blurb:
      "ESPN-inspired: a live scores ticker across the top, a featured story plus result/scoreboard cards in the main column, and a Top-10 standings rail.",
    pros: "Leans into the competition/ratings identity · live results up front · highly scannable.",
    cons: "Dense and broadcast-flavored; less personal than the feed.",
    Component: EspnScores,
  },
];

export default function WebLayoutsPage() {
  const [active, setActive] = React.useState(0);
  const concept = CONCEPTS[active];
  const Active = concept.Component;

  return (
    <div className="space-y-8">
      <section className="space-y-4 pt-8">
        <h1 className="font-display text-5xl uppercase leading-none text-foreground sm:text-6xl">
          Web Layout Concepts
        </h1>
        <p className="max-w-3xl font-body text-lg text-muted-foreground">
          Seven full-screen desktop directions for the web app, each
          demonstrated on a different screen. Concept 01 (Persistent Sidebar) has
          shipped as the authed web shell; at{" "}
          <code className="font-mono text-sm">lg</code> and up the app now uses a
          persistent left rail with a widened content column, keeping the
          centered <code className="font-mono text-sm">max-w-md</code> mobile
          column below <code className="font-mono text-sm">lg</code>. The rest
          explore other ways it could use the whole viewport. Previews are visual
          mockups with placeholder data; controls are non-interactive.
        </p>
      </section>

      {/* Concept switcher */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {CONCEPTS.map((c, i) => {
          const isActive = i === active;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setActive(i)}
              className={`whitespace-nowrap border-b-2 px-4 py-2 font-heading text-sm uppercase tracking-wide transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="mr-2 font-mono">{String(i + 1).padStart(2, "0")}</span>
              {c.label}
              {c.shipped && (
                <span className="ml-2 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Shipped
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active concept caption */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
        <div className="space-y-2">
          <div className="flex items-baseline gap-3">
            <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-foreground">
              {concept.label}
            </h2>
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {concept.screen}
            </span>
            {concept.shipped && (
              <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Shipped · authed web shell
              </span>
            )}
          </div>
          <p className="max-w-2xl font-body text-sm text-muted-foreground">
            {concept.blurb}
          </p>
        </div>
        <div className="space-y-1 md:text-right">
          <p className="font-body text-sm text-success">+ {concept.pros}</p>
          <p className="font-body text-sm text-primary">− {concept.cons}</p>
        </div>
      </div>

      {/* Full-bleed preview */}
      <ConceptFrame url={concept.url}>
        <Active />
      </ConceptFrame>
    </div>
  );
}
