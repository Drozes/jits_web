"use client";

import { useState } from "react";
import { Plus, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionTemplate } from "@jits/shared/types/session";
import { TemplateCard } from "./template-card";
import { TemplateFormDialog } from "./template-form-dialog";

interface SessionTemplatesProps {
  gymId: string;
  templates: SessionTemplate[];
  isManager: boolean;
}

export function SessionTemplates({ gymId, templates, isManager }: SessionTemplatesProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<SessionTemplate | null>(null);

  function handleEdit(template: SessionTemplate) {
    setEditTemplate(template);
    setFormOpen(true);
  }

  function handleAdd() {
    setEditTemplate(null);
    setFormOpen(true);
  }

  const activeTemplates = templates.filter((t) => t.is_active);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <CalendarClock className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Session Templates</h2>
          {activeTemplates.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-bold text-muted-foreground">
              {activeTemplates.length}
            </span>
          )}
        </div>
        {isManager && (
          <Button variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </div>

      {activeTemplates.length > 0 ? (
        <div className="flex flex-col gap-2">
          {activeTemplates.map((t) => (
            <TemplateCard key={t.id} template={t} isManager={isManager} onEdit={handleEdit} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No session templates yet</p>
        </div>
      )}

      <TemplateFormDialog
        gymId={gymId}
        template={editTemplate}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </section>
  );
}
