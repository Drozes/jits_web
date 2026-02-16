import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/api/chat-queries";
import { ChatThread } from "./chat-thread";

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

  // Fetch conversation metadata
  const { data: convParticipants } = await supabase
    .from("conversation_participants")
    .select("athlete_id")
    .eq("conversation_id", conversationId);

  const otherParticipantId = convParticipants?.find(
    (p) => p.athlete_id !== athlete.id,
  )?.athlete_id;

  // Fetch conversation details for the header
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, type, gym_id, gyms!fk_conversations_gym(name)")
    .eq("id", conversationId)
    .single();

  let headerName = "Chat";
  if (conversation?.type === "gym") {
    const gyms = conversation.gyms as { name: string }[] | null;
    headerName = gyms?.[0]?.name ?? "Gym Chat";
  } else if (otherParticipantId) {
    const { data: otherAthlete } = await supabase
      .from("athletes")
      .select("display_name")
      .eq("id", otherParticipantId)
      .single();
    headerName = otherAthlete?.display_name ?? "Chat";
  }

  // Prefetch initial messages (newest 50, reversed to chronological)
  const initialMessages = await getMessages(supabase, conversationId);

  return (
    <ChatThread
      conversationId={conversationId}
      currentAthleteId={athlete.id}
      headerName={headerName}
      otherAthleteId={otherParticipantId ?? null}
      initialMessages={initialMessages.reverse()}
    />
  );
}
