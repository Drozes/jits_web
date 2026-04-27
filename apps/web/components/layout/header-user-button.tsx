import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getInitials, getProfilePhotoUrl } from "@/lib/utils";

export async function HeaderUserButton() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) return null;

  const { data: athlete } = await supabase
    .from("athletes")
    .select("display_name, profile_photo_url")
    .eq("auth_user_id", user.sub)
    .single();

  const displayName = athlete?.display_name ?? (user.email as string);
  const initials = getInitials(displayName);
  const photoUrl = getProfilePhotoUrl(athlete?.profile_photo_url ?? null);

  return (
    <Link href="/profile" className="flex items-center gap-2">
      <Avatar className="h-8 w-8">
        {photoUrl && (
          <AvatarImage src={photoUrl} alt={displayName} className="object-cover" />
        )}
        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}
