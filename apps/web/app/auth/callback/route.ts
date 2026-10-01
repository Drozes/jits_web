import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { INVITE_COOKIE } from "@/lib/invites/constants";
import { attributeInviteCookie } from "@/lib/invites/cookie-attribution";
import { planCallbackInvite } from "@/lib/invites/cookie-plan";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First authenticated request: a pending invite cookie is attributed
      // here (contract 6). A challenge goes back to its landing page to
      // accept unless ?next= already points somewhere specific.
      const decision = await attributeInviteCookie(
        supabase,
        request.cookies.get(INVITE_COOKIE)?.value,
      );
      const plan = planCallbackInvite(decision, next);
      const response = NextResponse.redirect(`${origin}${plan.target}`);
      if (plan.clear) response.cookies.delete(INVITE_COOKIE);
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/error?error=server_error`);
}
