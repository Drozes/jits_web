# 003 — Chat Implementation Plan

> Step-by-step build plan for chat in JITS Web.
> **Prerequisites:** Backend 008-chat migration applied, types regenerated.
> **Reference:** [001-chat-backend-contract.md](001-chat-backend-contract.md) for schemas, [002-chat-architecture.md](002-chat-architecture.md) for decisions.

---

## Phase 0: Foundation (must do first)

### Step 0.1 — Regenerate Types

Run `npm run db:types` after applying the 008-chat migration to the local Supabase instance. This adds `conversations`, `conversation_participants`, `messages`, `conversation_type_enum`, and the 4 chat RPCs to `types/database.ts`.

**Add type aliases** to `types/` (following existing pattern):

```
types/conversation.ts   → Conversation, ConversationParticipant
types/message.ts        → Message, MessageInsert
types/composites.ts     → ConversationListRow (RPC return type), UnreadCountRow
```

### Step 0.2 — Configure Realtime on Browser Client

Update `lib/supabase/client.ts` to enable Web Worker heartbeats:

```ts
realtime: {
  heartbeatIntervalMs: 15000,
  worker: true,
}
```

This prevents silent disconnections on mobile/background tabs. Do this once, benefits all future realtime features.

### Step 0.3 — Build API Layer

**`lib/api/chat-queries.ts`** (server-side, RSC):
- `getConversations(supabase)` → wraps `get_conversations` RPC
- `getMessages(supabase, conversationId, opts?)` → paginated SELECT from `messages` table
- `getUnreadCounts(supabase)` → wraps `get_unread_counts` RPC

**`lib/api/chat-mutations.ts`** (client-side):
- `createDirectConversation(supabase, otherAthleteId)` → wraps `create_direct_conversation` RPC → `Result<{ conversationId, alreadyExists }>`
- `sendMessage(supabase, { conversationId, senderIdid, body })` → INSERT into `messages` → `Result<{ id }>`
- `sendImageMessage(supabase, { conversationId, senderId, file, caption? })` → upload to `chat-images` + INSERT → `Result<{ id, imageUrl }>`
- `markConversationRead(supabase, conversationId)` → wraps `mark_conversation_read` RPC → `Result<void>`

All mutations follow the `Result<T>` pattern from `lib/api/errors.ts`.

**New error codes in `lib/api/errors.ts`:**
- `SELF_CONVERSATION`
- `INVALID_ATHLETE` (reuse existing if present)
- `NOT_PARTICIPANT`

---

## Phase 1: Inbox (Conversation List)

### Step 1.1 — Inbox Page + Route

Create `app/(app)/messages/page.tsx` (sync, Suspense wrapper) and `app/(app)/messages/messages-content.tsx` (async, data fetching).

**Server component fetches:**
- `getConversations()` → inbox list
- Current athlete ID from `requireAthlete()`

**Renders:**
- List of `<ConversationCard>` components
- Empty state if no conversations

### Step 1.2 — ConversationCard Component

`components/domain/conversation-card.tsx` — under 80 lines.

**Props:** single `conversation` object (the RPC return row).

**Renders:**
- Avatar (profile photo via `<Avatar>` or initials fallback; gym icon for gym chats)
- Display name (athlete name for direct, gym name for gym)
- Last message preview (100 chars, from RPC)
- Relative timestamp (reuse or extract date formatting helper)
- Unread count badge (shadcn `<Badge>` or custom dot)
- Link to `/messages/{conversation_id}`

### Step 1.3 — Bottom Nav Update

Add Messages icon to `components/layout/bottom-nav-bar.tsx`.

**Options (pick one):**
- 5-item nav: Home | Arena | Messages | Leaderboard | Profile
- Replace Arena with Messages if Arena usage is low

Include unread badge (red dot or count) on the Messages icon.

### Step 1.4 — Unread Count Provider

Create `hooks/use-unread-counts.ts` (or context provider in layout):
- Polls `get_unread_counts` RPC every 30 seconds
- Re-fetches on window focus (`visibilitychange` event)
- Exposes `totalUnread` number for the nav badge
- Wrap in the `(app)` layout so it's available everywhere

---

## Phase 2: Conversation Thread

### Step 2.1 — Thread Page + Route

Create `app/(app)/messages/[id]/page.tsx` (sync, Suspense) and `thread-content.tsx` (async).

**Server component fetches:**
- Initial 50 messages (newest first) via `getMessages()`
- Conversation metadata (other athlete name, type, etc.)
- Current athlete ID

**Passes to client component:**
- `initialMessages`, `conversationId`, `currentAthleteId`, `otherAthleteName`

### Step 2.2 — Chat Thread Client Component

`app/(app)/messages/[id]/chat-thread.tsx` — `"use client"`, main interactive component.

**Manages:**
- Message state (local `useState`)
- Realtime subscription (postgres_changes on `messages`)
- Typing indicators (Broadcast send/receive)
- Gap recovery on reconnect
- Optimistic message sending
- Scroll behavior (auto-scroll to bottom, preserve position on load-more)
- Mark-as-read on mount

**This is the most complex component.** Keep it under 120 lines by extracting hooks:

### Step 2.3 — `use-chat-channel` Hook

`hooks/use-chat-channel.ts`

**Responsibilities:**
- Create Supabase channel: `chat:{conversationId}`
- Subscribe to `postgres_changes` (INSERT on `messages`, filtered by `conversation_id`)
- Handle typing Broadcast events (send + receive)
- Gap recovery: on SUBSCRIBED status, query DB for messages newer than `lastMessageAt`
- Cleanup: `removeChannel()` on unmount
- Return: `{ sendTypingEvent, typingUsers, isConnected }`

### Step 2.4 — `use-chat-messages` Hook

`hooks/use-chat-messages.ts`

**Responsibilities:**
- Message array state
- `addMessage(msg)` — dedup by ID, update `lastMessageAt` ref
- `sendMessage(body)` — optimistic insert + DB INSERT
- `loadOlderMessages()` — cursor-based pagination (query messages < oldest `created_at`)
- `hasMore` flag (set to false when query returns < 50)
- Return: `{ messages, sendMessage, loadOlderMessages, hasMore, isSending }`

### Step 2.5 — MessageBubble Component

`components/domain/message-bubble.tsx` — under 80 lines.

**Props:** `message` object + `isOwn` boolean + `showSender` boolean (for gym chats).

**Renders:**
- Right-aligned primary-color bubble for own messages
- Left-aligned muted bubble for received messages
- Text body (plain text, no HTML rendering)
- Image (if `image_url` present) — loaded via signed URL
- Timestamp (small, below message)
- Pending state (reduced opacity if `_pending`)
- Sender name (for gym chats, above bubble)

### Step 2.6 — MessageInput Component

`components/domain/message-input.tsx` — under 80 lines.

**Props:** `onSend(body)`, `onImageSend(file, caption?)`, `disabled?`, `disabledReason?`

**Renders:**
- Auto-growing textarea (max 4 visible lines)
- Send button (arrow icon, disabled when empty)
- Image attachment button (paperclip/camera icon)
- Character count when approaching 2000 limit
- Disabled overlay with reason text when athlete is not active

### Step 2.7 — TypingIndicator Component

`components/domain/typing-indicator.tsx` — tiny component.

**Props:** `typingUsers: string[]` (display names)

**Renders:**
- "John is typing..." / "John and Jane are typing..." / "Several people are typing..."
- Animated dots (CSS only, no JS animation)
- Hidden when no one is typing

---

## Phase 3: Image Messages

### Step 3.1 — Image Upload in MessageInput

Add to `message-input.tsx`:
- File input (hidden, triggered by attachment button)
- Client-side validation: type (JPEG/PNG/WebP), size (<5MB)
- Preview modal/sheet before sending (with optional caption)

### Step 3.2 — Image Send Flow

In `chat-mutations.ts` `sendImageMessage()`:
1. Upload file to `chat-images/{conversationId}/{uuid}.ext`
2. INSERT message with `image_url` = relative path
3. Return signed URL for immediate display

**Optimistic:** Show local blob URL immediately, replace with signed URL after upload completes.

### Step 3.3 — Image Display in MessageBubble

- Render `<img>` with signed URL
- Loading skeleton while image loads
- Max width: bubble width. Aspect ratio preserved.
- Tap to expand (optional — can use a shadcn Dialog for full-screen view)
- Caption text below image (if `body` is present alongside `image_url`)

---

## Phase 4: Entry Points & Navigation

### Step 4.1 — "Message" Button on Competitor Profile

Add a "Message" button to `app/(app)/athlete/[id]/` page.

**On tap:**
1. Call `createDirectConversation(otherAthleteId)` — idempotent
2. Navigate to `/messages/{conversationId}`

### Step 4.2 — "Message" from Challenge Context

On the challenge VS card or challenge detail, add a secondary "Message" action.

**Same flow:** Create/open DM → navigate to thread.

### Step 4.3 — Gym Chat Auto-Entry

Gym chats appear automatically in the inbox (managed by backend trigger). No special frontend logic needed — they just show up in `get_conversations()` results with `conversation_type = 'gym'`.

---

## Phase 5: Polish

### Step 5.1 — Date Separators

Group messages by date in the thread view:
- "Today", "Yesterday", "Feb 14, 2026"
- Rendered as centered, muted text between message bubbles

### Step 5.2 — Scroll-to-Bottom FAB

When user has scrolled up and new messages arrive:
- Show a floating "scroll to bottom" button with unread count
- Tap to smooth-scroll to bottom

### Step 5.3 — Empty States

- Inbox empty: "No conversations yet. Challenge someone to start chatting!"
- Thread empty (new DM): "Say hello to {name}! Send the first message."
- Gym chat empty: "Be the first to post in the {gym name} chat."

### Step 5.4 — Loading States

- Inbox: skeleton cards (3-4 shimmer rows)
- Thread: skeleton bubbles
- Sending message: pending opacity + spinner on send button
- Loading older messages: spinner at top of thread
- Image upload: progress indicator on bubble

### Step 5.5 — Mark-as-Read Trigger

Call `markConversationRead()`:
- On thread mount (entering a conversation)
- On window focus while in a conversation
- On scroll-to-bottom in an already-open conversation

After marking read, update the inbox badge count.

---

## Estimated Component Count

| Layer | Files | Notes |
|-------|-------|-------|
| Routes (pages) | 4 | inbox page + content, thread page + content |
| Domain components | 5 | conversation-card, message-bubble, message-input, typing-indicator, chat-image-preview |
| Hooks | 3 | use-chat-channel, use-chat-messages, use-unread-counts |
| API layer | 2 | chat-queries, chat-mutations |
| Types | 2-3 | conversation.ts, message.ts, composites additions |
| **Total** | **~16-17 files** | |

---

## Build Order Summary

```
Phase 0: Foundation
  0.1  Regenerate types (npm run db:types + type aliases)
  0.2  Configure realtime on browser client (worker: true)
  0.3  Build chat API layer (queries + mutations)

Phase 1: Inbox
  1.1  Inbox page + route
  1.2  ConversationCard component
  1.3  Bottom nav update (Messages icon + badge)
  1.4  Unread count provider

Phase 2: Thread (core experience)
  2.1  Thread page + route
  2.2  Chat thread client component
  2.3  use-chat-channel hook (realtime + typing + gap recovery)
  2.4  use-chat-messages hook (state + pagination + optimistic)
  2.5  MessageBubble component
  2.6  MessageInput component
  2.7  TypingIndicator component

Phase 3: Images
  3.1  Image picker + validation in MessageInput
  3.2  Image upload + send flow
  3.3  Image display in MessageBubble

Phase 4: Entry points
  4.1  "Message" button on competitor profile
  4.2  "Message" from challenge context
  4.3  Gym chat auto-entry (no work — just works)

Phase 5: Polish
  5.1  Date separators
  5.2  Scroll-to-bottom FAB
  5.3  Empty states
  5.4  Loading states / skeletons
  5.5  Mark-as-read triggers
```

---

## Dependencies

- **Backend:** 008-chat migration must be applied to local Supabase
- **Types:** Must regenerate after migration
- **shadcn components:** May need to add `scroll-area` (`npx shadcn@latest add scroll-area`) for the message thread
- **No new npm packages required** — everything uses existing Supabase JS + React + Tailwind
