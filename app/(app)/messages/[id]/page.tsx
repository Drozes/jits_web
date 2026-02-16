import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/api/chat-queries";
import { ChatThread, type ParticipantInfo } from "./chat-thread";

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="h-6 w-24 bg-muted rounded" />
      <div className="flex-1 space-y-3 py-4">
        <div className="flex justify-end"><div className="h-10 w-40 bg-muted rounded-2xl" /></div>
        <div className="flex justify-start"><div className="h-10 w-48 bg-muted rounded-2xl" /></div>
        <div className="flex justify-end"><div className="h-10 w-32 bg-muted rounded-2xl" /></div>
      </div>
      <div className="h-12 bg-muted rounded-lg" />
    </div>
  );
}

export default function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <ThreadData paramsPromise={params} />
    </Suspense>
  );
}

async function ThreadData({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: conversationId } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch participant athlete IDs + profiles in parallel with conversation details
  const [{ data: convParticipants }, { data: conversation }] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select("athlete_id")
      .eq("conversation_id", conversationId),
    supabase
      .from("conversations")
      .select("id, type, gym_id, gyms!fk_conversations_gym(name)")
      .eq("id", conversationId)
      .single(),
  ]);

  const participantIds = convParticipants?.map((p) => p.athlete_id) ?? [];
  const otherParticipantId = participantIds.find((id) => id !== athlete.id);

  // Fetch all participant profiles (for avatars + names in thread)
  const { data: participantProfiles } = participantIds.length > 0
    ? await supabase
        .from("athletes")
        .select("id, display_name, profile_photo_url")
        .in("id", participantIds)
    : { data: [] };

  const participants: Record<string, ParticipantInfo> = {};
  for (const p of participantProfiles ?? []) {
    participants[p.id] = {
      displayName: p.display_name,
      profilePhotoUrl: p.profile_photo_url,
    };
  }

  let headerName = "Chat";
  let headerPhotoUrl: string | null = null;
  if (conversation?.type === "gym") {
    const gyms = conversation.gyms as { name: string }[] | null;
    headerName = gyms?.[0]?.name ?? "Gym Chat";
  } else if (otherParticipantId) {
    const other = participants[otherParticipantId];
    headerName = other?.displayName ?? "Chat";
    headerPhotoUrl = other?.profilePhotoUrl ?? null;
  }

  // Prefetch initial messages (newest 50, reversed to chronological)
  const initialMessages = await getMessages(supabase, conversationId);

  return (
    <ChatThread
      conversationId={conversationId}
      conversationType={conversation?.type ?? "direct"}
      currentAthleteId={athlete.id}
      headerName={headerName}
      headerPhotoUrl={headerPhotoUrl}
      otherAthleteId={otherParticipantId ?? null}
      participants={participants}
      initialMessages={initialMessages.reverse()}
    />
  );
}
