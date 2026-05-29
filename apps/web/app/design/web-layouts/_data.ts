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

// Strava-style social activity feed (concept 6)
export type ActivityStat = { label: string; value: string };

export type ActivityPost = {
  id: string;
  athlete: string;
  timeAgo: string;
  kind: "match" | "training";
  title: string;
  location: string; // gym · mat
  stats: ActivityStat[];
  kudos: number;
  comments: number;
  youKudosed: boolean;
  result?: "win" | "loss" | "draw"; // match posts
  eloDelta?: number; // match posts
};

export const ACTIVITY_FEED: ActivityPost[] = [
  {
    id: "f1",
    athlete: "Marcus Reyes",
    timeAgo: "2h ago",
    kind: "match",
    title: "Submitted Diego Salvatierra",
    location: "Atos HQ · Mat A",
    stats: [
      { label: "Method", value: "RNC" },
      { label: "Round", value: "2" },
      { label: "ELO", value: "+24" },
    ],
    kudos: 24,
    comments: 6,
    youKudosed: true,
    result: "win",
    eloDelta: 24,
  },
  {
    id: "f2",
    athlete: "Kade Ruotolo",
    timeAgo: "5h ago",
    kind: "training",
    title: "Evening Open Mat",
    location: "Atos · Mat B",
    stats: [
      { label: "Rounds", value: "6" },
      { label: "Subs", value: "3" },
      { label: "Mat Time", value: "48m" },
    ],
    kudos: 31,
    comments: 12,
    youKudosed: false,
  },
  {
    id: "f3",
    athlete: "Mica Galvao",
    timeAgo: "Yesterday",
    kind: "match",
    title: "Beat Andrew Tackett on points",
    location: "Fight Sports · Mat 1",
    stats: [
      { label: "Method", value: "Points" },
      { label: "Score", value: "6-4" },
      { label: "ELO", value: "+12" },
    ],
    kudos: 18,
    comments: 4,
    youKudosed: false,
    result: "win",
    eloDelta: 12,
  },
  {
    id: "f4",
    athlete: "Nicholas Meregali",
    timeAgo: "2d ago",
    kind: "training",
    title: "Morning Drilling Session",
    location: "New Wave · Main Mat",
    stats: [
      { label: "Rounds", value: "8" },
      { label: "Focus", value: "Guard" },
      { label: "Mat Time", value: "62m" },
    ],
    kudos: 54,
    comments: 9,
    youKudosed: true,
  },
];

export const WEEKLY_SUMMARY: ActivityStat[] = [
  { label: "Rounds", value: "22" },
  { label: "Matches", value: "4" },
  { label: "Submissions", value: "5" },
  { label: "ELO", value: "+37" },
  { label: "Mat Time", value: "3h 12m" },
];

export type SuggestedAthlete = { id: string; name: string; subtitle: string };

export const SUGGESTED_ATHLETES: SuggestedAthlete[] = [
  { id: "s1", name: "Tye Ruotolo", subtitle: "Atos · 1821 ELO" },
  { id: "s2", name: "Andrew Tackett", subtitle: "Daisy Fresh · 1744 ELO" },
  { id: "s3", name: "Victor Hugo", subtitle: "Six Blades · 1689 ELO" },
];

// ESPN-style scores + news (concept 7)
export type Fixture = {
  id: string;
  status: "LIVE" | "FINAL" | "UPCOMING";
  statusDetail: string; // "R2 4:12" | "Final · Sub" | "Fri 7:00"
  a: { name: string; elo: number; score: string };
  b: { name: string; elo: number; score: string };
  winner?: "a" | "b";
};

export const FIXTURES: Fixture[] = [
  {
    id: "fx1",
    status: "LIVE",
    statusDetail: "R2 · 4:12",
    a: { name: "Gordon Ryan", elo: 2412, score: "2" },
    b: { name: "Nicholas Meregali", elo: 2288, score: "0" },
  },
  {
    id: "fx2",
    status: "FINAL",
    statusDetail: "Final · Sub R2",
    a: { name: "Marcus Reyes", elo: 1847, score: "SUB" },
    b: { name: "Diego Salvatierra", elo: 1712, score: "-" },
    winner: "a",
  },
  {
    id: "fx3",
    status: "FINAL",
    statusDetail: "Final · Points",
    a: { name: "Kade Ruotolo", elo: 2103, score: "8" },
    b: { name: "Tye Ruotolo", elo: 1821, score: "2" },
    winner: "a",
  },
  {
    id: "fx4",
    status: "UPCOMING",
    statusDetail: "Fri · 7:00 PM",
    a: { name: "Mica Galvao", elo: 1798, score: "-" },
    b: { name: "Andrew Tackett", elo: 1744, score: "-" },
  },
  {
    id: "fx5",
    status: "FINAL",
    statusDetail: "Final · Sub R1",
    a: { name: "Victor Hugo", elo: 1689, score: "SUB" },
    b: { name: "Felipe Pena", elo: 1655, score: "-" },
    winner: "a",
  },
];

export type Story = {
  id: string;
  tag: string;
  headline: string;
  dek: string;
  timeAgo: string;
  featured?: boolean;
};

export const STORIES: Story[] = [
  {
    id: "st1",
    tag: "Featured",
    headline: "Reyes taps Salvatierra to crack the top 5",
    dek: "A second-round rear-naked choke vaults Marcus Reyes to #4 with his biggest ELO swing of the season.",
    timeAgo: "2h ago",
    featured: true,
  },
  {
    id: "st2",
    tag: "Rankings",
    headline: "Ruotolo brothers both climb after Austin open mat",
    dek: "Kade and Tye each banked ranked wins over the weekend, tightening the lightweight ladder.",
    timeAgo: "5h ago",
  },
  {
    id: "st3",
    tag: "Tonight",
    headline: "Ryan vs Meregali headlines the New Wave main mat",
    dek: "The top two seeds meet live tonight in the most-watched matchup of the week.",
    timeAgo: "Live now",
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
