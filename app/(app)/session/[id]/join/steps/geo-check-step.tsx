"use client";

import { useEffect, useState } from "react";
import { MapPin, CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type GeoStatus = "checking" | "success" | "far" | "failed" | "denied";

interface GeoCheckStepProps {
  gymLatitude: number;
  gymLongitude: number;
  gymName: string;
  onNext: () => void;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function GeoCheckStep({ gymLatitude, gymLongitude, gymName, onNext }: GeoCheckStepProps) {
  const [status, setStatus] = useState<GeoStatus>("checking");

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus("failed");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineKm(pos.coords.latitude, pos.coords.longitude, gymLatitude, gymLongitude);
        setStatus(dist < 2 ? "success" : "far");
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "failed");
      },
      { timeout: 10_000 },
    );
  }, [gymLatitude, gymLongitude]);

  const icon = {
    checking: <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />,
    success: <CheckCircle className="h-12 w-12 text-green-500" />,
    far: <AlertTriangle className="h-12 w-12 text-amber-500" />,
    failed: <XCircle className="h-12 w-12 text-muted-foreground" />,
    denied: <MapPin className="h-12 w-12 text-muted-foreground" />,
  }[status];

  const message = {
    checking: "Checking your location...",
    success: `You're near ${gymName}`,
    far: `You appear to be far from ${gymName}. You can still continue.`,
    failed: "Location unavailable. You can still continue.",
    denied: "Location permission denied. You can still continue.",
  }[status];

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      {icon}
      <p className="text-center text-sm text-muted-foreground">{message}</p>
      {status !== "checking" && (
        <Button onClick={onNext} className="w-full rounded-xl">
          {status === "success" ? "Continue" : "Continue anyway"}
        </Button>
      )}
    </div>
  );
}
