import * as React from "react";
import { useRouter } from "expo-router";
import { Alert, Pressable, Text } from "react-native";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { leaveSessionLobby } from "@jits/shared/api/mutations";
import { cn } from "@/lib/cn";

interface LeaveButtonProps {
  sessionId: string;
  /**
   * "compact": small tertiary text button (mounts in the AppHeader right slot).
   * "block":   full-width outlined cta (mounts at the bottom of the lobby).
   */
  variant?: "compact" | "block";
}

/**
 * Leave-session button. Confirms via Alert before mutating the lobby row to
 * `status = 'left'`. Mirrors the web flow (which uses `window.confirm`).
 *
 * The compact variant matches the C4 wireframe (line 1015): a small tertiary
 * "Leave" link sitting in the topbar's right slot. The block variant is the
 * fallback CTA shape used at the bottom of the lobby.
 */
export function LeaveButton({ sessionId, variant = "compact" }: LeaveButtonProps) {
  const router = useRouter();
  const [leaving, setLeaving] = React.useState(false);

  function handlePress() {
    Alert.alert(
      "Leave session?",
      "You’ll be removed from the lobby. You can rejoin if the session is still active.",
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

  if (variant === "block") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Leave session"
        onPress={handlePress}
        disabled={leaving}
        className={cn(
          "border border-negative rounded-sm py-3 items-center",
          leaving && "opacity-50",
          "active:bg-surface-3",
        )}
      >
        <Text className="font-heading text-[12px] text-negative uppercase tracking-caps">
          {leaving ? "Leaving..." : "Leave Session"}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Leave session"
      onPress={handlePress}
      disabled={leaving}
      className={cn("px-2 py-2", leaving && "opacity-50")}
      hitSlop={6}
    >
      <Text className="font-heading text-[11px] text-negative uppercase tracking-caps">
        {leaving ? "Leaving..." : "Leave"}
      </Text>
    </Pressable>
  );
}
