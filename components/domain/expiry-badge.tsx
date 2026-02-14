"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

function formatTimeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState(() => formatTimeLeft(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(formatTimeLeft(expiresAt));
    }, 60_000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const isUrgent =
    new Date(expiresAt).getTime() - Date.now() < 1000 * 60 * 60 * 24;

  return (
    <Badge
      variant="outline"
      className={`gap-1 text-xs shrink-0 ${isUrgent ? "border-red-500/50 text-red-500" : ""}`}
    >
      <Clock className="h-3 w-3" />
      {timeLeft}
    </Badge>
  );
}
