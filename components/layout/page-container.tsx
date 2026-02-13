import { cn } from "@/lib/utils";

export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("max-w-md mx-auto px-4 pb-20 w-full", className)}>
      {children}
    </div>
  );
}
