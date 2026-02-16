# 001 — Chat Backend Contract Reference

> **Feature**: 008-chat | **Status**: Migration complete, on `main`
> **Migration**: `jr_be/supabase/migrations/20260216100000_chat.sql`
> **Integration Guide**: `jr_be/FRONTEND_INTEGRATION_GUIDE.md` (lines 765–989)

---

## Tables

### `conversations`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | UUID | No | PK, auto-generated |
| `type` | `conversation_type_enum` | No | `'direct'` or `'gym'` |
| `gym_id` | UUID | Yes | FK → `gyms`. Required when `type='gym'`, NULL when `type='direct'` |
| `created_at` | TIMESTAMPTZ | No | Default `now()` |

**Constraints:**
- `chk_conversations_gym_required` — gym type requires `gym_id`, direct type requires NULL
- `uq_conversations_gym` — one conversation per gym (UNIQUE on `gym_id`, NULLs excluded)

### `conversation_participants`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `conversation_id` | UUID | No | PK part 1, FK → `conversations` (CASCADE) |
| `athlete_id` | UUID | No | PK part 2, FK → `athletes` (CASCADE) |
| `joined_at` | TIMESTAMPTZ | No | Default `now()` |
| `last_read_at` | TIMESTAMPTZ | No | Default `now()` — messages after this are unread |

### `messages`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | UUID | No | PK, auto-generated |
| `conversation_id` | UUID | No | FK → `conversations` (CASCADE) |
| `sender_id` | UUID | No | FK → `athletes` (CASCADE) |
| `body` | TEXT | Yes | Max 2000 chars. NULL if image-only. |
| `image_url` | TEXT | Yes | Relative path in `chat-images` bucket. NULL if text-only. |
| `created_at` | TIMESTAMPTZ | No | Default `now()` |

**Constraints:**
- `chk_messages_has_content` — at least one of `body` or `image_url` must be present
- `chk_messages_body_length` — body max 2000 characters
- Messages are **immutable** in v1 (no edit/delete)

---

## Indexes

| Index | Columns | Notes |
|-------|---------|-------|
| `idx_conversations_type` | `conversations(type)` | |
| `idx_conversations_gym` | `conversations(gym_id)` | Partial: WHERE `gym_id IS NOT NULL` |
| `idx_cp_athlete` | `conversation_participants(athlete_id)` | Critical for RLS lookups |
| `idx_messages_conversation_created` | `messages(conversation_id, created_at DESC)` | Pagination + last-message preview |
| `idx_messages_sender` | `messages(sender_id)` | |

---

## RLS Policies

All three tables have RLS enabled + forced.

**Helper function:** `is_conversation_participant(p_conversation_id UUID)` — SECURITY DEFINER to avoid RLS recursion. Uses `auth_athlete_id()` internally.

| Table | Operation | Policy | Rule |
|-------|-----------|--------|------|
| `conversations` | SELECT | `conversations_select_participant` | Must be participant |
| `conversation_participants` | SELECT | `cp_select_participant` | Must be in same conversation |
| `conversation_participants` | UPDATE | `cp_update_own` | Own row only (for `mark_conversation_read`) |
| `messages` | SELECT | `messages_select_participant` | Must be participant |
| `messages` | INSERT | `messages_insert_participant` | Must be participant + sender = self + `status = 'active'` |

---

## RPC Functions

### `create_direct_conversation(p_other_athlete_id UUID)` → JSONB

Creates or returns existing 1-on-1 conversation. **Idempotent.** Uses advisory lock for race-condition safety.

```typescript
const { data } = await supabase.rpc('create_direct_conversation', {
  p_other_athlete_id: opponentId
});
// { conversation_id: UUID, already_exists: boolean }
```

**Validations:** Prevents self-conversation, requires other athlete to be `active`.

### `get_conversations()` → TABLE

Returns all conversations for the caller with metadata.

```typescript
const { data } = await supabase.rpc('get_conversations');
```

**Returns per row:**
| Field | Type | Notes |
|-------|------|-------|
| `conversation_id` | UUID | |
| `conversation_type` | enum | `'direct'` or `'gym'` |
| `gym_id` | UUID | NULL for direct |
| `gym_name` | VARCHAR | NULL for direct |
| `other_athlete_id` | UUID | NULL for gym |
| `other_athlete_display_name` | VARCHAR | NULL for gym |
| `other_athlete_profile_photo_url` | TEXT | NULL for gym |
| `last_message_body` | TEXT | Truncated to 100 chars |
| `last_message_sender_id` | UUID | |
| `last_message_created_at` | TIMESTAMPTZ | |
| `unread_count` | BIGINT | 0 if no unread messages |

**Ordered by:** most recent message (or `created_at` if no messages).

### `mark_conversation_read(p_conversation_id UUID)` → JSONB

Updates `last_read_at = now()` for the caller.

```typescript
const { data } = await supabase.rpc('mark_conversation_read', {
  p_conversation_id: conversationId
});
// { success: true, conversation_id: UUID, read_at: TIMESTAMPTZ }
```

**Error:** `not_participant` if caller isn't in the conversation.

### `get_unread_counts()` → TABLE

Lightweight — returns only conversations with unread > 0.

```typescript
const { data } = await supabase.rpc('get_unread_counts');
// [{ conversation_id: UUID, unread_count: BIGINT }, ...]
// Conversations with 0 unread are ABSENT — treat absence as 0
```

---

## Storage: `chat-images` Bucket

| Property | Value |
|----------|-------|
| Bucket ID | `chat-images` |
| Public | **No** (private — requires signed URLs) |
| Max file size | 5 MB |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |

**File path convention:** `{conversation_id}/{uuid}.{ext}`

**RLS:**
| Operation | Who | Rule |
|-----------|-----|------|
| SELECT (download) | Conversation participants | Folder = `conversation_id` |
| INSERT (upload) | Conversation participants | Same folder check |
| UPDATE (replace) | Original uploader | `owner = auth.uid()` |
| DELETE | Original uploader | `owner = auth.uid()` |

**Display pattern:** Always use `createSignedUrl(path, 3600)`, never `getPublicUrl()`.

---

## Gym Chat Auto-Membership Trigger

`trg_02_manage_gym_chat` fires AFTER UPDATE on `athletes`:

- Athlete changes `primary_gym_id` → removed from old gym chat, added to new
- Athlete status leaves `active`/`inactive` → removed from gym chat
- Re-activation → re-added to gym chat
- Lazy-creates gym conversation on first join
- Free agents (no gym) have no gym chat — direct messages only

**No frontend action needed** — entirely trigger-driven.

---

## Direct Query Patterns

### Load Messages (Paginated)

```typescript
// Initial load (newest 50)
const { data } = await supabase
  .from('messages')
  .select('id, conversation_id, sender_id, body, image_url, created_at')
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: false })
  .limit(50);

// Load older (cursor-based)
const { data } = await supabase
  .from('messages')
  .select('*')
  .eq('conversation_id', conversationId)
  .lt('created_at', lastLoadedTimestamp)
  .order('created_at', { ascending: false })
  .limit(50);
```

### Send a Message

```typescript
// Text
await supabase.from('messages').insert({
  conversation_id: conversationId,
  sender_id: myAthleteId,
  body: 'Ready for round 2?'
});

// Image + optional caption
await supabase.from('messages').insert({
  conversation_id: conversationId,
  sender_id: myAthleteId,
  image_url: `${conversationId}/${uuid}.jpg`,
  body: caption || null
});
```

### Upload Chat Image

```typescript
// 1. Upload
const filePath = `${conversationId}/${crypto.randomUUID()}.jpg`;
await supabase.storage.from('chat-images').upload(filePath, file);

// 2. Send message referencing the image
await supabase.from('messages').insert({ conversation_id, sender_id, image_url: filePath });

// 3. Display — signed URL (bucket is private)
const { data } = await supabase.storage.from('chat-images').createSignedUrl(filePath, 3600);
```

---

## Business Rules Summary

| Rule | Detail |
|------|--------|
| DM is idempotent | `create_direct_conversation` is safe to call from any "Message" button |
| Gym auto-membership | Trigger-driven, no frontend action |
| Send requires active | Only `status = 'active'` athletes can send; suspended/banned can read |
| Messages are immutable | No edit or delete in v1 |
| Image bucket is private | Always `createSignedUrl()`, never `getPublicUrl()` |
| Unread via `last_read_at` | Call `mark_conversation_read` when user opens a conversation |
| Typing is ephemeral | Broadcast only, no DB. Auto-dismiss after ~3 seconds |
