import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";

export async function AuthButton() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (user) {
    const { data: athlete } = await supabase
      .from("athletes")
      .select("display_name")
      .eq("auth_user_id", user.sub)
      .single();

    const displayName = athlete?.display_name ?? user.email;

    return (
      <div className="flex items-center gap-4">
        Hey, {displayName}!
        <Button asChild size="sm" variant={"outline"}>
          <Link href="/profile">Profile</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href="/signup">Sign up</Link>
      </Button>
    </div>
  );
}
