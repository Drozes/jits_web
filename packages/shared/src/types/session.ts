/**
 * Session domain types for gym-based matchmaking events.
 */

import type { Tables, TablesInsert } from "./database";

export type Session = Tables<"sessions">;
export type SessionInsert = TablesInsert<"sessions">;
export type SessionParticipant = Tables<"session_participants">;
export type SessionRsvp = Tables<"session_rsvps">;

/** Session template for recurring sessions at a gym */
export interface SessionTemplate {
  id: string;
  gym_id: string;
  title: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  max_participants: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

/** Params for creating a new gym */
export interface CreateGymParams {
  name: string;
  city: string;
}

/** Params for updating an existing gym */
export interface UpdateGymParams {
  name?: string;
  city?: string;
}

/** Shape returned by getGymsWithSessions query */
export interface GymListItem {
  id: string;
  name: string;
  city: string | null;
  status: string;
  memberCount: number;
  activeSessions: number;
  upcomingSessions: number;
  hasActiveSession: boolean;
}

/** Individual session for list views */
export interface SessionListItem {
  id: string;
  title: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  participantCount: number;
  maxParticipants: number | null;
  rsvpCount: number;
  createdBy: string;
  createdByName: string;
}

/** Shape returned by getGymDetail query */
export interface GymDetail {
  id: string;
  name: string;
  city: string | null;
  status: string;
  sessions: SessionListItem[];
  rsvpSessionIds: string[];
  /** Session IDs where the current athlete is a checked-in participant. */
  participantSessionIds: string[];
  memberCount: number;
  isMemberGym: boolean;
  isGymManager: boolean;
}

/** Dashboard active session card shape */
export interface ActiveSessionInfo {
  sessionId: string;
  gymId: string;
  gymName: string;
  status: "scheduled" | "active";
  scheduledStart: string;
  scheduledEnd: string;
  participantCount: number;
  isRsvpd: boolean;
  isCheckedIn: boolean;
}

/** Participant from get_session_lobby RPC */
export interface LobbyParticipant {
  participantId: string;
  athleteId: string;
  displayName: string;
  currentElo: number;
  currentWeight: number | null;
  profilePhotoUrl: string | null;
  primaryGymId: string | null;
  gymName: string | null;
  status: string;
  weightConfirmed: number | null;
  currentMatchId: string | null;
  checkedInAt: string;
  eloDistance: number;
}

/** Wrapper for session lobby data */
export interface SessionLobbyData {
  sessionId: string;
  gymName: string;
  status: string;
  participants: LobbyParticipant[];
}

/** Data for join wizard (Phase 4) */
export interface SessionJoinData {
  sessionId: string;
  gymName: string;
  gymCity: string | null;
  gymLatitude: number | null;
  gymLongitude: number | null;
  status: string;
  requiresWaiver: boolean;
  hasSignedWaiver: boolean;
  athleteWeight: number | null;
}
