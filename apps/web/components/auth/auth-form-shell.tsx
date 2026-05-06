"use client";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthFormShellProps extends React.ComponentPropsWithoutRef<"div"> {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function AuthFormShell({
  title,
  description,
  children,
  className,
  ...props
}: AuthFormShellProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
