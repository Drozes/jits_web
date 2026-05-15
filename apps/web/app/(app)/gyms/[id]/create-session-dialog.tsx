"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { createSession } from "@jits/shared/api/mutations";

interface CreateSessionDialogProps {
  gymId: string;
}

type StartPreset = "now" | "+30" | "+60" | "custom";
type DurationPreset = 1 | 2 | 3;

function computeStartTime(preset: StartPreset): Date {
  const now = new Date();
  if (preset === "+30") return new Date(now.getTime() + 30 * 60 * 1000);
  if (preset === "+60") return new Date(now.getTime() + 60 * 60 * 1000);
  return now;
}

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CreateSessionDialog({ gymId }: CreateSessionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("Open Mat");
  const [startPreset, setStartPreset] = useState<StartPreset>("now");
  const [customStart, setCustomStart] = useState(toDatetimeLocal(new Date()));
  const [duration, setDuration] = useState<DurationPreset>(2);
  const [maxParticipants, setMaxParticipants] = useState(20);
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const startDate =
      startPreset === "custom" ? new Date(customStart) : computeStartTime(startPreset);
    const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);

    const supabase = createClient();
    const result = await createSession(supabase, {
      gymId,
      title: title.trim() || undefined,
      scheduledStart: startDate.toISOString(),
      scheduledEnd: endDate.toISOString(),
      maxParticipants: maxParticipants > 0 ? maxParticipants : undefined,
      notes: notes.trim() || undefined,
    });

    if (result.ok) {
      toast.success("Session created");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  const startPresets: { value: StartPreset; label: string }[] = [
    { value: "now", label: "Now" },
    { value: "+30", label: "+30 min" },
    { value: "+60", label: "+1 hour" },
    { value: "custom", label: "Custom" },
  ];

  const durationPresets: { value: DurationPreset; label: string }[] = [
    { value: 1, label: "1h" },
    { value: 2, label: "2h" },
    { value: 3, label: "3h" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          style={{
            display: "inline-flex",
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
            fontFamily: "var(--font-heading)",
            fontSize: "var(--size-label-l)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps)",
            padding: "var(--space-3) var(--space-5)",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--accent-cta)",
            background: "var(--accent-cta)",
            color: "var(--text-on-accent)",
            cursor: "pointer",
          }}
        >
          <Plus className="h-4 w-4" />
          Start Session
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Session</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-title">Title</Label>
            <Input
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Open Mat"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Start Time</Label>
            <div className="flex gap-2">
              {startPresets.map((p) => (
                <Button
                  key={p.value}
                  type="button"
                  size="sm"
                  variant={startPreset === p.value ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setStartPreset(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {startPreset === "custom" && (
              <Input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="mt-1"
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Duration</Label>
            <div className="flex gap-2">
              {durationPresets.map((d) => (
                <Button
                  key={d.value}
                  type="button"
                  size="sm"
                  variant={duration === d.value ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setDuration(d.value)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="max-participants">Max Participants</Label>
            <Input
              id="max-participants"
              type="number"
              min={2}
              max={100}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-notes">Notes (optional)</Label>
            <textarea
              id="session-notes"
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details for participants..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
