import * as React from "react";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import { LogOut } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { leaveSessionLobby } from "@jits/shared/api/mutations";

interface LeaveButtonProps {
  sessionId: string;
}

/**
 * Leave-session button. Confirms via Alert before mutating the lobby
 * row to `status = 'left'`. Mirrors the web flow (which uses `window.confirm`).
 */
export function LeaveButton({ sessionId }: LeaveButtonProps) {
  const router = useRouter();
  const tokens = useThemedTokens();
  const [leaving, setLeaving] = React.useState(false);

  function handlePress() {
    Alert.alert(
      "Leave session?",
      "You'll be removed from the lobby. You can rejoin if the session is still active.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            setLeaving(true);
            const result = await leaveSessionLobby(supabase, sessionId);
            setLeaving(false);
            if (!result.ok) {
              toast.error({
                text1: "Could not leave",
                description: result.error.message,
              });
              return;
            }
            router.replace("/gyms");
          },
        },
      ],
    );
  }

  return (
    <Button
      variant="outline"
      onPress={handlePress}
      disabled={leaving}
      leftIcon={<LogOut size={16} color={tokens.foreground} />}
    >
      {leaving ? "Leaving..." : "Leave Session"}
    </Button>
  );
}
