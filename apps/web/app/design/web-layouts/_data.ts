// Shared hardcoded placeholder data for the /design/web-layouts concepts.
// Pure preview data - no Supabase, no auth. Keeps every concept self-contained
// and visually consistent so the team can compare layout paradigms apples-to-apples.

export const CURRENT_ATHLETE = {
  name: "Marcus Reyes",
  belt: "Brown",
  gym: "Atos HQ",
  elo: 1847,
  weightLbs: 178,
  record: { wins: 31, losses: 12, draws: 3 },
  rank: 4,
} as const;

export type RecentMatch = {
  id: string;
  opponentName: string;
  result: "win" | "loss" | "draw";
  matchType: "ranked" | "casual";
  eloDelta: number;
  date: string;
};

export const RECENT_MATCHES: RecentMatch[] = [
  { id: "m1", opponentName: "Diego Salvatierra", result: "win", matchType: "ranked", eloDelta: 24, date: "2d ago" },
  { id: "m2", opponentName: "Kade Ruotolo", result: "loss", matchType: "ranked", eloDelta: -31, date: "5d ago" },
  { id: "m3", opponentName: "Tye Ruotolo", result: "win", matchType: "casual", eloDelta: 0, date: "1w ago" },
  { id: "m4", opponentName: "Mica Galvao", result: "draw", matchType: "ranked", eloDelta: -8, date: "1w ago" },
  { id: "m5", opponentName: "Andrew Tackett", result: "win", matchType: "ranked", eloDelta: 19, date: "2w ago" },
];

export type FeedItem = {
  id: string;
  winnerName: string;
  loserName: string;
  result: "submission" | "points" | "decision" | "draw";
  matchType: "ranked" | "casual";
  date: string;
};

export const RECENT_ACTIVITY: FeedItem[] = [
  { id: "a1", winnerName: "Gordon Ryan", loserName: "Felipe Pena", result: "submission", matchType: "ranked", date: "1h ago" },
  { id: "a2", winnerName: "Nicholas Meregali", loserName: "Victor Hugo", result: "points", matchType: "ranked", date: "3h ago" },
  { id: "a3", winnerName: "Marcus Reyes", loserName: "Diego Salvatierra", result: "submission", matchType: "ranked", date: "2d ago" },
];

export type RankEntry = {
  rank: number;
  name: string;
  subtitle: string;
  elo: number;
  delta: number;
};

export const RANKINGS: RankEntry[] = [
  { rank: 1, name: "Gordon Ryan", subtitle: "New Wave · 218 lb", elo: 2412, delta: 12 },
  { rank: 2, name: "Nicholas Meregali", subtitle: "New Wave · 195 lb", elo: 2288, delta: 8 },
  { rank: 3, name: "Kade Ruotolo", subtitle: "Atos · 155 lb", elo: 2103, delta: -4 },
  { rank: 4, name: "Marcus Reyes", subtitle: "Atos HQ · 178 lb", elo: 1847, delta: 24 },
  { rank: 5, name: "Tye Ruotolo", subtitle: "Atos · 170 lb", elo: 1821, delta: 0 },
  { rank: 6, name: "Mica Galvao", subtitle: "Fight Sports · 170 lb", elo: 1798, delta: -8 },
  { rank: 7, name: "Andrew Tackett", subtitle: "Daisy Fresh · 155 lb", elo: 1744, delta: 6 },
  { rank: 8, name: "Diego Salvatierra", subtitle: "Atos HQ · 185 lb", elo: 1712, delta: -31 },
  { rank: 9, name: "Victor Hugo", subtitle: "Six Blades · 220 lb", elo: 1689, delta: 3 },
  { rank: 10, name: "Felipe Pena", subtitle: "GFTeam · 200 lb", elo: 1655, delta: -12 },
];

export type GymEntry = {
  id: string;
  name: string;
  city: string;
  members: number;
  avgElo: number;
  liveNow: boolean;
};

export const GYMS: GymEntry[] = [
  { id: "g1", name: "Atos HQ", city: "San Diego, CA", members: 142, avgElo: 1612, liveNow: true },
  { id: "g2", name: "New Wave Jiu-Jitsu", city: "Austin, TX", members: 88, avgElo: 1701, liveNow: true },
  { id: "g3", name: "Daisy Fresh", city: "Mt. Vernon, IL", members: 54, avgElo: 1488, liveNow: false },
  { id: "g4", name: "Six Blades", city: "Atlanta, GA", members: 67, avgElo: 1533, liveNow: false },
  { id: "g5", name: "GFTeam", city: "Rio de Janeiro, BR", members: 210, avgElo: 1574, liveNow: false },
  { id: "g6", name: "Fight Sports", city: "Miami, FL", members: 96, avgElo: 1559, liveNow: true },
];

export const SELECTED_GYM = {
  name: "Atos HQ",
  city: "San Diego, CA",
  members: 142,
  avgElo: 1612,
  managers: 3,
  liveNow: true,
  liveSession: { participants: 14, startedMinsAgo: 22 },
  topMembers: RANKINGS.filter((r) => r.subtitle.includes("Atos")).slice(0, 4),
} as const;

export type ProfileStat = { label: string; value: string };

export const PROFILE_STATS: ProfileStat[] = [
  { label: "Matches", value: "46" },
  { label: "Win %", value: "67" },
  { label: "Sub %", value: "41" },
  { label: "Streak", value: "W3" },
];

export const PROFILE_DETAIL_STATS: ProfileStat[] = [
  { label: "Submissions", value: "19" },
  { label: "Points Wins", value: "9" },
  { label: "Decisions", value: "3" },
  { label: "Avg ELO Gain", value: "+14" },
  { label: "Peak ELO", value: "1902" },
  { label: "Pressure Score", value: "82" },
];

// Challenges pipeline (kanban concept)
export type ChallengeCard = {
  id: string;
  opponentName: string;
  subtitle: string; // gym · weight
  matchType: "ranked" | "casual";
  eloStake: number; // ELO at stake (win/loss magnitude)
  note: string; // contextual status line
  outcome?: "win" | "loss" | "draw"; // completed column only
};

export type ChallengeColumn = {
  key: string;
  title: string;
  cards: ChallengeCard[];
};

export const CHALLENGE_COLUMNS: ChallengeColumn[] = [
  {
    key: "incoming",
    title: "Incoming",
    cards: [
      { id: "c1", opponentName: "Kade Ruotolo", subtitle: "Atos · 155 lb", matchType: "ranked", eloStake: 31, note: "Wants to roll · expires 4h" },
      { id: "c2", opponentName: "Andrew Tackett", subtitle: "Daisy Fresh · 155 lb", matchType: "casual", eloStake: 0, note: "Open mat · expires 1d" },
    ],
  },
  {
    key: "awaiting",
    title: "Awaiting Response",
    cards: [
      { id: "c3", opponentName: "Mica Galvao", subtitle: "Fight Sports · 170 lb", matchType: "ranked", eloStake: 22, note: "Sent 2h ago" },
      { id: "c4", opponentName: "Tye Ruotolo", subtitle: "Atos · 170 lb", matchType: "ranked", eloStake: 18, note: "Sent yesterday" },
      { id: "c5", opponentName: "Victor Hugo", subtitle: "Six Blades · 220 lb", matchType: "casual", eloStake: 0, note: "Sent 3d ago" },
    ],
  },
  {
    key: "scheduled",
    title: "Scheduled",
    cards: [
      { id: "c6", opponentName: "Diego Salvatierra", subtitle: "Atos HQ · 185 lb", matchType: "ranked", eloStake: 24, note: "Fri 7:00 PM · Atos HQ" },
    ],
  },
  {
    key: "completed",
    title: "Completed",
    cards: [
      { id: "c7", opponentName: "Diego Salvatierra", subtitle: "Atos HQ · 185 lb", matchType: "ranked", eloStake: 24, note: "2d ago · Submission", outcome: "win" },
      { id: "c8", opponentName: "Kade Ruotolo", subtitle: "Atos · 155 lb", matchType: "ranked", eloStake: 31, note: "5d ago · Points", outcome: "loss" },
      { id: "c9", opponentName: "Mica Galvao", subtitle: "Fight Sports · 170 lb", matchType: "ranked", eloStake: 8, note: "1w ago · Draw", outcome: "draw" },
    ],
  },
];

// Arena / live matchmaking (split-screen concept)
export const ARENA = {
  onlineCount: 184,
  liveSessions: 6,
  featured: {
    left: { name: "Gordon Ryan", gym: "New Wave", elo: 2412, weightLbs: 218 },
    right: { name: "Nicholas Meregali", gym: "New Wave", elo: 2288, weightLbs: 195 },
    sessionLabel: "Main Mat · Live now",
  },
  available: [
    { id: "av1", name: "Kade Ruotolo", subtitle: "2103 ELO · 155 lb", status: "available" as const },
    { id: "av2", name: "Tye Ruotolo", subtitle: "1821 ELO · 170 lb", status: "available" as const },
    { id: "av3", name: "Andrew Tackett", subtitle: "1744 ELO · 155 lb", status: "available" as const },
    { id: "av4", name: "Diego Salvatierra", subtitle: "1712 ELO · 185 lb", status: "busy" as const },
    { id: "av5", name: "Mica Galvao", subtitle: "1798 ELO · 170 lb", status: "available" as const },
    { id: "av6", name: "Victor Hugo", subtitle: "1689 ELO · 220 lb", status: "available" as const },
  ],
} as const;

export const NAV_ITEMS = [
  { label: "Home", key: "home" },
  { label: "Gyms", key: "gyms" },
  { label: "Rankings", key: "rankings" },
  { label: "Profile", key: "profile" },
] as const;
