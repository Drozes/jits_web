"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <Button
      variant="ghost"
      className="w-full justify-start text-destructive hover:text-destructive"
      onClick={logout}
    >
      <LogOut className="mr-3 h-4 w-4" />
      Sign Out
    </Button>
  );
}
