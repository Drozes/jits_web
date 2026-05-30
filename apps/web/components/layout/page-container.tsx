import { cn } from "@/lib/utils";

export function PageContainer({
  className,
  wide = false,
  children,
}: {
  className?: string;
  /**
   * Opt-in desktop widening. When set, the comfortable max-w-md column below lg
   * widens at >= lg to use the desktop viewport beside the persistent sidebar.
   * Default stays narrow so the ~24 other consumers are unaffected.
   */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-md px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]",
        wide && "lg:max-w-3xl lg:px-6",
        className,
      )}
      style={{ background: "var(--bg-primary)" }}
    >
      {children}
    </div>
  );
}
