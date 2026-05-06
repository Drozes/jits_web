# Gym Manager Feature Spec

## Overview

Upgrade session creation from a single "Start Session" button (hardcoded 2h, no title) to a full Create Session dialog with time/title/capacity controls. Add session management for creators (activate, cancel, edit).

## Current State

- `create_session` RPC accepts: `p_gym_id`, `p_scheduled_start`, `p_scheduled_end`, `p_title`, `p_max_participants`, `p_notes`
- Frontend `createSession()` mutation hardcodes 2h from now, no title, no notes
- RLS: `sessions_update_creator` allows UPDATE by `created_by` only
- Session statuses: `scheduled | active | completed | cancelled`
- No edit/cancel/activate UI or mutations exist

## Requirements

### 1. Update `createSession` Mutation

In `packages/shared/src/api/mutations.ts`, update `createSession` to accept optional params:

```ts
interface CreateSessionParams {
  gymId: string;
  title?: string;           // default: "Open Mat"
  scheduledStart?: string;   // ISO, default: now
  scheduledEnd?: string;     // ISO, default: start + 2h
  maxParticipants?: number;  // default: 20
  notes?: string;
}
```

### 2. Add Session Management Mutations

In `packages/shared/src/api/mutations.ts`:

- `updateSession(supabase, sessionId, fields)` - direct UPDATE (RLS protects to creator)
- `cancelSession(supabase, sessionId)` - sets status = 'cancelled'
- `activateSession(supabase, sessionId)` - sets status = 'active'
- `completeSession(supabase, sessionId)` - sets status = 'completed'

### 3. Create Session Dialog (Web)

Replace `StartSessionButton` with a dialog/sheet containing:

- **Title** input (default: "Open Mat")
- **Start Time** with presets: "Now", "+30 min", "+1 hour", custom datetime picker
- **Duration** presets: 1h, 2h, 3h (computes end time from start)
- **Max Participants** input (default: 20)
- **Notes** textarea (optional)

File: `apps/web/app/(app)/gyms/[id]/create-session-dialog.tsx`

### 4. Session Creator Controls (Web)

On session cards (when viewer is the creator), show management actions:

- **Activate** (when status = 'scheduled'): transitions to active
- **Cancel** (when status = 'scheduled' or 'active'): marks cancelled
- **End Session** (when status = 'active'): marks completed

These can be a dropdown menu or inline buttons on the session card. Only visible to `session.createdBy === currentAthleteId`.

File: Add to existing `session-list.tsx` or new `session-actions.tsx`

### 5. Session Card Enhancement

Pass `currentAthleteId` and `session.createdBy` through to enable creator-only controls.

## Out of Scope

- Mobile implementation (follow-on)
- Backend RPC changes (RLS direct updates sufficient for MVP)
- Session editing dialog (defer to follow-on, just do status transitions for now)
- Recurring sessions
