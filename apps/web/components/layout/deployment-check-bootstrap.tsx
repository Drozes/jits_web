"use client";

import { useDeploymentCheck } from "@/hooks/use-deployment-check";

export function DeploymentCheckBootstrap() {
  useDeploymentCheck();
  return null;
}
