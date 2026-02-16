# 002 — Chat Frontend Architecture

> Decisions, patterns, and trade-offs for building production-quality chat into JITS Web.
> Goal: best-in-class mobile-first UX with rock-solid stability.

---

## 1. Realtime Strategy Decision

### Options Evaluated

| Approach | How it works | Latency | Persistence | Missed messages? |
|----------|-------------|---------|-------------|------------------|
| **A. Broadcast only** | Client → Supabase Realtime → other clients | ~6ms | No | Lost forever |
| **B. Postgres Changes** | INSERT → WAL → Realtime push | ~50-100ms | Yes | Recoverable from DB |
| **C. Broadcast from DB** | INSERT → trigger → `realtime.broadcast_changes()` | ~20ms | Yes | Recoverable from DB |
| **D. Hybrid** | Client Broadcast for instant + INSERT for backup | ~6ms display | Yes | Recoverable, but duplicates |

### Decision: **B. Postgres Changes** (for alpha)

**Why:**
- The backend integration guide explicitly recommends this pattern with code examples
- Simplest mental model: INSERT into `messages` table → Supabase Realtime picks up the WAL change → pushes to subscribers
- Automatic persistence — every message that triggers realtime was already written to DB
- No extra trigger setup needed (unlike Broadcast from DB)
- Supabase JS `postgres_changes` subscription is battle-tested
- Single-threaded WAL processing guarantees message ordering
- At JITS alpha scale (~100 concurrent users), the throughput bottleneck is irrelevant

**When to upgrade to Broadcast from DB:** If we hit >500 concurrent chat users and notice latency >200ms on message delivery. That's a v2 concern.

### Reconnection Gap Recovery

Supabase Realtime does **not** guarantee delivery. Disconnected clients miss messages.

**Pattern:**
```
1. Client subscribes to postgres_changes on messages table
2. Track timestamp of last received message
3. On reconnect (channel status → SUBSCRIBED):
   - Query DB for messages where created_at > lastReceivedAt
   - Deduplicate by ID and merge into local state
4. Resume realtime subscription for new messages
```

**Implementation:**
```tsx
// Track last message timestamp
const lastMessageAt = useRef<string>(new Date().toISOString())

// On SUBSCRIBED event (initial + reconnects), fill the gap
channel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .gt('created_at', lastMessageAt.current)
      .order('created_at', { ascending: true })

    if (data?.length) {
      setMessages(prev => deduplicateById([...prev, ...data]))
      lastMessageAt.current = data[data.length - 1].created_at
    }
  }
})
```

### Web Worker Heartbeats

Mobile PWAs aggressively throttle background tabs, killing WebSocket heartbeats. Supabase thinks the client is dead and drops the connection — silently.

**Must configure on the browser Supabase client:**
```ts
const supabase = createBrowserClient(url, key, {
  realtime: {
    heartbeatIntervalMs: 15000,
    worker: true,  // offload heartbeats to Web Worker
  }
})
```

This is critical for a mobile-first app. Without `worker: true`, background tabs will silently disconnect after ~30 seconds.

---

## 2. Optimistic Updates

For a "god damn best UX" feel, messages must appear **instantly** when sent — not after the DB round-trip + realtime echo.

**Pattern:**
1. Generate a client-side UUID for the message
2. Immediately add to local state with a `_pending: true` flag
3. INSERT into `messages` table with that UUID
4. When the realtime event arrives for the same UUID, replace the pending message (removing `_pending` flag)
5. If INSERT fails, remove from local state and show error toast

```tsx
const sendMessage = async (body: string) => {
  const optimisticId = crypto.randomUUID()
  const optimistic = {
    id: optimisticId,
    conversation_id: conversationId,
    sender_id: myAthleteId,
    body,
    image_url: null,
    created_at: new Date().toISOString(),
    _pending: true,
  }

  // Instant local update
  setMessages(prev => [...prev, optimistic])
  scrollToBottom()

  const { error } = await supabase.from('messages').insert({
    id: optimisticId,  // use the same UUID
    conversation_id: conversationId,
    sender_id: myAthleteId,
    body,
  })

  if (error) {
    setMessages(prev => prev.filter(m => m.id !== optimisticId))
    toast.error('Failed to send message')
  }
}
```

**Deduplication** — when the realtime event arrives for our own message:
```ts
const deduplicateById = (messages: Message[]) => {
  const seen = new Map<string, Message>()
  for (const msg of messages) {
    const existing = seen.get(msg.id)
    // Prefer the DB version (no _pending flag) over the optimistic version
    if (!existing || existing._pending) {
      seen.set(msg.id, msg)
    }
  }
  return Array.from(seen.values())
}
```

---

## 3. Typing Indicators

Uses Broadcast (ephemeral, no DB) on the same channel as message subscriptions.

**UX rules:**
- Show "X is typing..." after receiving a typing event
- Auto-dismiss after 3 seconds of no typing events from that user
- Don't send typing events more often than every 300ms (debounce)
- Clear typing state when a message is sent by that user

**Integration guide pattern:**
```tsx
// Send (debounced)
channel.send({
  type: 'broadcast',
  event: 'typing',
  payload: { athlete_id: myAthleteId, display_name: myName }
})

// Receive
channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
  setTypingUsers(prev => ({ ...prev, [payload.athlete_id]: Date.now() }))
  // Auto-dismiss after 3s
  setTimeout(() => {
    setTypingUsers(prev => {
      const { [payload.athlete_id]: _, ...rest } = prev
      return rest
    })
  }, 3000)
})
```

---

## 4. Message Pagination

Cursor-based, not offset-based (offset breaks when new messages arrive).

**Page size:** 50 messages (matches integration guide examples).

**Infinite scroll up pattern:**
1. Initial load: newest 50 messages (reverse chronological)
2. User scrolls to top → load 50 more older than the oldest loaded message
3. Continue until no more messages returned (`data.length < 50`)
4. New messages arrive at the bottom via realtime (no interference with pagination)

**Scroll behavior:**
- On new message (own or received): auto-scroll to bottom
- On load-older: preserve scroll position (don't jump)
- On initial load: scroll to bottom

---

## 5. Unread Counts

### Inbox Badge (Bottom Nav)

Poll `get_unread_counts()` RPC:
- On app focus / visibility change
- Every 30 seconds while inbox is not open
- After sending or receiving a message

Show total unread as a badge number on the Messages nav icon.

### Per-Conversation Unread

The `get_conversations()` RPC already returns `unread_count` per conversation. Use directly in the inbox list.

### Mark as Read

Call `mark_conversation_read` RPC when:
- User opens a conversation
- User scrolls to the bottom of an already-open conversation
- Window regains focus while conversation is open

---

## 6. Image Messages

### Upload Flow
1. User selects image from camera/gallery
2. Show image preview with optional caption input
3. On send:
   a. Upload to `chat-images` bucket: `{conversationId}/{uuid}.{ext}`
   b. INSERT message with `image_url` = relative path, `body` = caption or null
4. For display, create signed URL with 1-hour TTL

### Image Display
- Use signed URLs (`createSignedUrl(path, 3600)`) — bucket is private
- Cache signed URLs client-side (they're valid for 1 hour)
- Show loading skeleton while image loads
- Tap to view full-size (optional v1 enhancement)
- Max 5MB, JPEG/PNG/WebP only (enforced by Storage RLS)

### Optimistic Image Upload
- Show local blob URL immediately as placeholder
- Replace with signed URL after upload + INSERT completes
- Show upload progress indicator on the message bubble

---

## 7. Component Architecture

Following JITS patterns: server components for data fetching, client components for interactivity, domain components under 80 lines.

### Routes

```
app/(app)/messages/                → Inbox (conversation list)
app/(app)/messages/[id]/           → Conversation thread
```

Add "Messages" to the bottom nav bar (between Arena and Leaderboard, or replace one).

### Server Components (data fetching)

```
app/(app)/messages/page.tsx              → Suspense wrapper
app/(app)/messages/messages-content.tsx   → Fetches conversations via RPC
app/(app)/messages/[id]/page.tsx          → Suspense wrapper
app/(app)/messages/[id]/thread-content.tsx → Fetches initial messages + conversation metadata
```

### Client Components (interactivity)

```
components/domain/
  conversation-card.tsx     → Inbox list item (avatar, name, preview, unread badge, timestamp)
  message-bubble.tsx        → Single message (text/image, alignment, pending state)
  message-input.tsx         → Text input + image picker + send button
  typing-indicator.tsx      → "X is typing..." display
  chat-image-preview.tsx    → Image upload preview with caption (optional — could be inline)
```

### Hooks

```
hooks/
  use-chat-channel.ts       → Manages realtime subscription + typing + gap recovery
  use-chat-messages.ts      → Message state, pagination, optimistic updates, dedup
  use-unread-counts.ts      → Global unread polling for nav badge
```

### API Layer Extensions

```
lib/api/
  chat-queries.ts           → getConversations(), getMessages(), getUnreadCounts()
  chat-mutations.ts         → createDirectConversation(), sendMessage(), sendImageMessage(), markConversationRead()
```

All mutations return `Result<T>` following the established error pattern.

---

## 8. UX Polish Details

### Conversation List (Inbox)
- Avatar (profile photo or initials) + display name
- Last message preview (100 chars, from RPC)
- Relative timestamp ("2m", "1h", "Yesterday")
- Unread count badge (filled dot or number)
- Gym chats show gym name + gym icon instead of athlete avatar
- Pull-to-refresh (or refresh on focus)
- Empty state: "No conversations yet. Challenge someone to start chatting!"

### Conversation Thread
- Messages grouped by date ("Today", "Yesterday", "Feb 14")
- Own messages right-aligned (primary color bubble), others left-aligned (muted bubble)
- Sender avatar on received messages (especially for gym chats with multiple senders)
- Typing indicator at the bottom of the message list
- Image messages render inline with tap-to-expand
- Pending messages show subtle opacity reduction
- Auto-scroll to bottom on new message (if already at bottom)
- "Scroll to bottom" FAB if user has scrolled up
- Load-more spinner when scrolling to top

### Message Input
- Multi-line text input (auto-grow, max ~4 lines visible)
- Send button (enabled only when content exists)
- Image attachment button (camera icon)
- Character count indicator near 2000 limit
- Disabled state with message when athlete status is not `active`

### Nav Integration
- Messages icon in bottom nav with unread badge
- Unread count updates on focus, on message receive, every 30s
- "Message" button on competitor profile pages → creates/opens DM

---

## 9. State Management

No global state library needed. Each chat screen manages its own state:

- **Inbox:** Server-fetched on mount, refreshed on focus. No client-side cache needed.
- **Thread:** Client-side `useState` for messages array. Realtime subscription adds new messages. Pagination extends the array upward.
- **Unread counts:** Simple `useState` in a context provider wrapping the app layout, polled on interval + focus.

### Why not React Query / SWR?

For alpha, the chat screens are leaf routes — you're either in the inbox or in a thread, rarely switching fast. The overhead of a query cache isn't justified yet. The realtime subscription handles freshness for the active thread, and the inbox is re-fetched on mount.

**Revisit if:** we add caching for faster back-navigation, or gym chats with many participants cause re-render issues.

---

## 10. Error Handling

Follow the established `Result<T>` pattern from `lib/api/errors.ts`.

### New Error Codes

| Code | Trigger | UI Response |
|------|---------|-------------|
| `SELF_CONVERSATION` | Trying to DM yourself | Should never happen (hide button) |
| `INVALID_ATHLETE` | Other athlete inactive/not found | "This athlete is no longer active" |
| `NOT_PARTICIPANT` | Accessing conversation you're not in | Redirect to inbox |
| `SEND_REQUIRES_ACTIVE` | Suspended/banned user tries to send | Disabled input + "Account suspended" message |
| `MESSAGE_TOO_LONG` | Body > 2000 chars | Client-side validation prevents this |
| `IMAGE_TOO_LARGE` | File > 5MB | Client-side validation + toast |
| `IMAGE_INVALID_TYPE` | Not JPEG/PNG/WebP | Client-side validation + toast |

### Realtime Error Recovery

| Event | Action |
|-------|--------|
| Channel `CLOSED` | Auto-reconnect (built-in exponential backoff) |
| Channel `CHANNEL_ERROR` | Log error, attempt resubscribe |
| Token expired | Supabase auto-refreshes JWT; if refresh fails, redirect to login |
| Gap on reconnect | Query DB for missed messages (see section 1) |

---

## 11. Security Considerations

- **RLS handles authorization** — no frontend permission checks needed beyond UI gating
- **Signed URLs for images** — never expose raw storage paths to the client
- **No XSS in message rendering** — render `body` as plain text, never `dangerouslySetInnerHTML`
- **Sender validation** — RLS enforces `sender_id = auth_athlete_id()`, can't impersonate
- **Active status gate** — RLS prevents suspended/banned users from sending; frontend shows disabled state
- **Image upload validation** — client-side type/size checks + Storage RLS as backstop

---

## 12. What to Skip for Alpha

| Feature | Why skip | When to add |
|---------|----------|-------------|
| Message reactions | Low priority for 1:1 combat chat | v2 if users request |
| Message edit/delete | DB constraint: immutable v1 | Requires BE migration |
| Read receipts (per-message) | `last_read_at` is sufficient | v2 |
| Link previews | Engineering cost vs. value | v2 |
| Push notifications | Requires Edge Function + FCM setup | After alpha launch |
| End-to-end encryption | Not needed for sports matchmaking | Never (unless pivoting) |
| Message search | Low value at alpha scale | v2 |
| Block/mute users | BE doesn't support yet | Needs BE feature first |
| Voice/video | Way out of scope | v3+ |

---

## Sources

- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime)
- [Supabase Realtime Chat Component](https://supabase.com/ui/docs/nextjs/realtime-chat)
- [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Realtime Broadcast from Database](https://supabase.com/blog/realtime-broadcast-from-database)
- [Realtime Benchmarks](https://supabase.com/docs/guides/realtime/benchmarks)
- [Silent Disconnections Guide](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794)
- [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [RLS Performance Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Push Notifications Guide](https://supabase.com/docs/guides/functions/examples/push-notifications)
- Backend: `jr_be/FRONTEND_INTEGRATION_GUIDE.md` (chat section)
- Backend: `jr_be/docs/rpc-contracts.md` (RPCs 8-11)
