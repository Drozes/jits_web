import { cn } from "@/lib/utils";

export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-md px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]",
        className,
      )}
      style={{ background: "var(--bg-primary)" }}
    >
      {children}
    </div>
  );
}
