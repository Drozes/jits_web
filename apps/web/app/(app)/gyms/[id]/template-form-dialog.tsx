"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { createSessionTemplate, updateSessionTemplate } from "@jits/shared/api/mutations";
import type { SessionTemplate } from "@jits/shared/types/session";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface TemplateFormDialogProps {
  gymId: string;
  template?: SessionTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateFormDialog({ gymId, template, open, onOpenChange }: TemplateFormDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("10:00");
  const [duration, setDuration] = useState(120);
  const [maxParticipants, setMaxParticipants] = useState("");
  const [notes, setNotes] = useState("");

  const isEdit = !!template;

  useEffect(() => {
    if (template) {
      setTitle(template.title);
      setDayOfWeek(template.day_of_week);
      setStartTime(template.start_time.slice(0, 5));
      setDuration(template.duration_minutes);
      setMaxParticipants(template.max_participants?.toString() ?? "");
      setNotes(template.notes ?? "");
    } else {
      setTitle("Open Mat");
      setDayOfWeek(1);
      setStartTime("10:00");
      setDuration(120);
      setMaxParticipants("");
      setNotes("");
    }
  }, [template, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);

    const supabase = createClient();
    const maxP = maxParticipants ? Number(maxParticipants) : null;

    const result = isEdit
      ? await updateSessionTemplate(supabase, template!.id, {
          title: title.trim(),
          dayOfWeek,
          startTime: startTime + ":00",
          durationMinutes: duration,
          maxParticipants: maxP,
          notes: notes.trim() || null,
        })
      : await createSessionTemplate(supabase, {
          gymId,
          title: title.trim(),
          dayOfWeek,
          startTime: startTime + ":00",
          durationMinutes: duration,
          maxParticipants: maxP,
          notes: notes.trim() || null,
        });

    if (result.ok) {
      toast.success(isEdit ? "Template updated" : "Template created");
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Template" : "New Template"}</DialogTitle>
        </DialogHeader>
        <TemplateFormFields
          title={title}
          setTitle={setTitle}
          dayOfWeek={dayOfWeek}
          setDayOfWeek={setDayOfWeek}
          startTime={startTime}
          setStartTime={setStartTime}
          duration={duration}
          setDuration={setDuration}
          maxParticipants={maxParticipants}
          setMaxParticipants={setMaxParticipants}
          notes={notes}
          setNotes={setNotes}
          loading={loading}
          isEdit={isEdit}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

interface TemplateFormFieldsProps {
  title: string;
  setTitle: (v: string) => void;
  dayOfWeek: number;
  setDayOfWeek: (v: number) => void;
  startTime: string;
  setStartTime: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  maxParticipants: string;
  setMaxParticipants: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  loading: boolean;
  isEdit: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

function TemplateFormFields(props: TemplateFormFieldsProps) {
  return (
    <form onSubmit={props.onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-title">Title</Label>
        <Input id="tpl-title" value={props.title} onChange={(e) => props.setTitle(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-day">Day of Week</Label>
        <select
          id="tpl-day"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={props.dayOfWeek}
          onChange={(e) => props.setDayOfWeek(Number(e.target.value))}
        >
          {DAYS.map((d, i) => (
            <option key={i} value={i}>{d}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-time">Start Time</Label>
          <Input id="tpl-time" type="time" value={props.startTime} onChange={(e) => props.setStartTime(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-duration">Duration (min)</Label>
          <Input id="tpl-duration" type="number" min={15} max={480} value={props.duration} onChange={(e) => props.setDuration(Number(e.target.value))} required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-max">Max Participants (optional)</Label>
        <Input id="tpl-max" type="number" min={2} max={100} value={props.maxParticipants} onChange={(e) => props.setMaxParticipants(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-notes">Notes (optional)</Label>
        <Input id="tpl-notes" value={props.notes} onChange={(e) => props.setNotes(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={props.loading || !props.title.trim()} className="w-full sm:w-auto">
          {props.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {props.isEdit ? "Save Changes" : "Create Template"}
        </Button>
      </DialogFooter>
    </form>
  );
}
