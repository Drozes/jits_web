"use client";

import { usePushRegistration } from "@/hooks/use-push-registration";

export function PushRegistrationBootstrap({
  athleteId,
}: {
  athleteId: string;
}) {
  usePushRegistration(athleteId);
  return null;
}
