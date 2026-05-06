"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { deleteSessionTemplate, createSessionFromTemplate } from "@jits/shared/api/mutations";
import type { SessionTemplate } from "@jits/shared/types/session";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface TemplateCardProps {
  template: SessionTemplate;
  isManager: boolean;
  onEdit: (template: SessionTemplate) => void;
}

export function TemplateCard({ template, isManager, onEdit }: TemplateCardProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleCreateSession() {
    setCreating(true);
    const supabase = createClient();
    const result = await createSessionFromTemplate(supabase, template.id);
    if (result.ok) {
      toast.success("Session created from template");
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
    setCreating(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    const result = await deleteSessionTemplate(supabase, template.id);
    if (result.ok) {
      toast.success("Template deleted");
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
    setDeleting(false);
  }

  const timeDisplay = template.start_time.slice(0, 5);

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="font-heading text-sm font-semibold truncate">{template.title}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {DAYS[template.day_of_week]} at {timeDisplay} ({template.duration_minutes}min)
          </p>
          {template.max_participants && (
            <p className="text-xs text-muted-foreground">Max {template.max_participants}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" onClick={handleCreateSession} disabled={creating}>
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          {isManager && (
            <>
              <Button size="sm" variant="ghost" onClick={() => onEdit(template)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
