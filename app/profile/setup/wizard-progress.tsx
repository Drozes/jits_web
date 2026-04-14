"use client";

interface WizardProgressProps {
  currentIdx: number;
  total: number;
  label: string;
}

export function WizardProgress({ currentIdx, total, label }: WizardProgressProps) {
  return (
    <div className="space-y-2">
      <p className="text-center text-xs text-muted-foreground">
        Step {currentIdx + 1} of {total} — {label}
      </p>
      <div
        role="progressbar"
        aria-valuenow={currentIdx + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Profile setup progress"
        className="flex justify-center gap-2"
      >
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              i === currentIdx ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
