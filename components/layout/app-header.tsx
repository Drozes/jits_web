"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  title: string;
  icon?: React.ReactNode;
  back?: boolean;
  rightAction?: React.ReactNode;
  className?: string;
}

export function AppHeader({
  title,
  icon,
  back = false,
  rightAction,
  className,
}: AppHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/50 bg-background/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl",
        className,
      )}
    >
      {back && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          aria-label="Go back"
          className="rounded-xl"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}

      <div className="flex flex-1 items-center gap-2.5">
        {icon && <span className="text-primary">{icon}</span>}
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      </div>

      {rightAction && <div className="flex items-center">{rightAction}</div>}
    </header>
  );
}
