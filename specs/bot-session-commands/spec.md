# Bot Session Commands Spec

## Overview

Upgrade the test bot (`jr_be/scripts/test-bot/bot.mjs`) to support session-based matchmaking. The app has moved from challenge-based to session-based matches, but the bot only knows about challenges.

## Current Bot Capabilities

- Creates/reuses bot athletes, joins presence channels
- Chat: auto-reply, proactive messages, message intents
- Challenges: send, accept, decline, cancel, auto-accept
- Seed: creates historical challenge-based matches with ELO
- AddAthlete: creates test athletes

## New Commands

### Session Management

| Command | Description |
|---------|-------------|
| `session` | Create a session at bot's gym, starting now, 2h duration |
| `session --in 5m` | Create session starting 5 minutes from now |
| `session --in 1h` | Create session starting 1 hour from now |
| `session --tomorrow` | Create session tomorrow at same time |
| `session --past 2h` | Create a past session (backdated, for seeding) |
| `sessions` | List active/scheduled sessions at bot's gym |
| `activate <session#>` | Transition session from scheduled to active |
| `endsession <session#>` | Transition session to completed |

Session creation uses direct SQL (service role) since the bot already uses `config.dbExec()` for admin operations. This avoids RPC auth constraints.

### Session Participation

| Command | Description |
|---------|-------------|
| `join [session#]` | Join a session lobby (insert into session_participants) |
| `leave` | Leave current session |

### Session Match Flow

| Command | Description |
|---------|-------------|
| `match <name>` | Create in-session match with named participant |
| `random` | Request random match (ELO proximity) |
| `startmatch` | Transition current match to in_progress |
| `endmatch` | End current match |
| `record <result>` | Record match result (win/loss/draw/sub) |
| `confirm` | Confirm match result |

### Updated Seed Command

`seed` should create session-based match history instead of challenge-based:

1. Create a past session at the bot's gym
2. Insert session_participants for bot + opponents
3. Create matches via direct SQL (same as current but with session_id instead of challenge_id)
4. Include match_participants, submissions, ELO calculations (same logic)

Format: `seed <N> [flags]` (same flags as current: `--athlete`, `--favourPlayer`)

## Implementation Notes

- Session creation via direct SQL: INSERT INTO sessions (gym_id, created_by, title, scheduled_start, scheduled_end, status, max_participants)
- For `--past` sessions, set status = 'completed' and backdate timestamps
- Session joining via SQL: INSERT INTO session_participants (session_id, athlete_id, status, weight_confirmed)
- Match creation reuses the existing seed logic but adds session_id to the match and removes the challenge dependency
- Track "current session" and "current match" in bot state for interactive flow
- Update the `help` command to show new session commands
- Keep all existing challenge commands working (backwards compatible)

## Doc Update

Update `jr_be/docs/test-bot.md` with new commands and examples.
