import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";

export async function HeaderUserButton() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) return null;

  const { data: athlete } = await supabase
    .from("athletes")
    .select("display_name")
    .eq("auth_user_id", user.sub)
    .single();

  const displayName = athlete?.display_name ?? (user.email as string);
  const initials = getInitials(displayName);

  return (
    <Link href="/profile" className="flex items-center gap-2">
      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}
