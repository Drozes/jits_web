import { redirect } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EloBadge } from "@/components/domain/elo-badge";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getLobbyData, getEloStakes } from "@/lib/api/queries";
import { getInitials } from "@/lib/utils";
import { MATCH_TYPE } from "@/lib/constants";
import { LobbyActions } from "./lobby-actions";

export async function LobbyContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: challengeId } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const lobby = await getLobbyData(supabase, challengeId);
  if (!lobby) redirect("/match/pending");

  const isChallenger = athlete.id === lobby.challenger.id;
  const stakes =
    lobby.match_type === MATCH_TYPE.RANKED
      ? await getEloStakes(
          supabase,
          lobby.challenger.current_elo,
          lobby.opponent.current_elo,
        )
      : null;

  return (
    <div className="space-y-6 animate-page-in">
      <VsHeader challenger={lobby.challenger} opponent={lobby.opponent} />

      <div className="text-center">
        <Badge
          variant={
            lobby.match_type === MATCH_TYPE.RANKED ? "default" : "secondary"
          }
        >
          {lobby.match_type === MATCH_TYPE.RANKED ? "Ranked" : "Casual"} Match
        </Badge>
      </div>

      {stakes && (
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground text-center mb-2">
              ELO Stakes
            </p>
            <div className="flex justify-center gap-4 text-sm font-semibold">
              <span className="text-green-600">
                Win: +{isChallenger ? stakes.challenger_win : stakes.opponent_win}
              </span>
              <span className="text-red-600">
                Loss: {isChallenger ? stakes.challenger_loss : stakes.opponent_loss}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <LobbyActions challengeId={challengeId} />
    </div>
  );
}

function AthleteColumn({
  name,
  elo,
  weight,
}: {
  name: string;
  elo: number;
  weight: number | null;
}) {
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <Avatar className="h-16 w-16 bg-gradient-to-br from-primary to-red-600 text-white border-2 border-muted shadow-md">
        <AvatarFallback className="bg-gradient-to-br from-primary to-red-600 text-white text-lg">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <p className="font-semibold text-sm truncate max-w-full">{name}</p>
      <EloBadge elo={elo} variant="compact" />
      {weight && (
        <p className="text-xs text-muted-foreground">{weight} lbs</p>
      )}
    </div>
  );
}

function VsHeader({
  challenger,
  opponent,
}: {
  challenger: { display_name: string; current_elo: number; current_weight: number | null };
  opponent: { display_name: string; current_elo: number; current_weight: number | null };
}) {
  return (
    <div className="flex items-center gap-4">
      <AthleteColumn
        name={challenger.display_name}
        elo={challenger.current_elo}
        weight={challenger.current_weight}
      />
      <span className="text-2xl font-black text-muted-foreground shrink-0">
        VS
      </span>
      <AthleteColumn
        name={opponent.display_name}
        elo={opponent.current_elo}
        weight={opponent.current_weight}
      />
    </div>
  );
}
