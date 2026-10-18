import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, .html and .mp4 files (.svg, .png, .jpg, .jpeg, .gif, .webp,
     *   .html, .mp4); the .mp4 skip serves the landing videos while the
     *   web app is locked (specs/web-landing/addendum-teaser-v2.md P13)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html|mp4)$).*)",
  ],
};
