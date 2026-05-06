import * as React from "react";
import { ActivityIndicator, Alert, Pressable } from "react-native";
import { MoreVertical } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import {
  activateSession,
  cancelSession,
  completeSession,
} from "@jits/shared/api/mutations";

interface SessionActionsProps {
  sessionId: string;
  status: string;
  onActionComplete: () => void;
}

type Action = "activate" | "cancel" | "complete";

const ACTION_CONFIG: Record<Action, { label: string; confirm: string }> = {
  activate: { label: "Activate", confirm: "Make this session active?" },
  cancel: { label: "Cancel Session", confirm: "Cancel this session?" },
  complete: { label: "End Session", confirm: "End this session?" },
};

export function SessionActions({ sessionId, status, onActionComplete }: SessionActionsProps) {
  const tokens = useThemedTokens();
  const [loading, setLoading] = React.useState(false);

  const actions: Action[] = React.useMemo(() => {
    const list: Action[] = [];
    if (status === "scheduled") list.push("activate");
    if (status === "active") list.push("complete");
    if (status === "scheduled" || status === "active") list.push("cancel");
    return list;
  }, [status]);

  if (actions.length === 0) return null;

  async function runAction(action: Action) {
    setLoading(true);
    const mutations = { activate: activateSession, cancel: cancelSession, complete: completeSession };
    const result = await mutations[action](supabase, sessionId);
    if (result.ok) {
      toast.success(ACTION_CONFIG[action].label + " done");
      onActionComplete();
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  function showMenu() {
    Alert.alert(
      "Session Actions",
      undefined,
      [
        ...actions.map((a) => ({
          text: ACTION_CONFIG[a].label,
          style: (a === "cancel" ? "destructive" : "default") as "destructive" | "default",
          onPress: () => confirmAction(a),
        })),
        { text: "Close", style: "cancel" as const },
      ],
    );
  }

  function confirmAction(action: Action) {
    Alert.alert(ACTION_CONFIG[action].confirm, undefined, [
      { text: "No", style: "cancel" },
      { text: "Yes", onPress: () => void runAction(action) },
    ]);
  }

  if (loading) {
    return <ActivityIndicator size="small" color={tokens.mutedForeground} />;
  }

  return (
    <Pressable onPress={showMenu} hitSlop={8} className="p-1">
      <MoreVertical size={16} color={tokens.mutedForeground} />
    </Pressable>
  );
}
