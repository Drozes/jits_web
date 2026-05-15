"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {isManager && (
        <button
          type="button"
          onClick={handleAdd}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-1)",
            fontFamily: "var(--font-heading)",
            fontSize: "var(--size-label-s)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps)",
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--border-hairline-strong)",
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            alignSelf: "flex-end",
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Template
        </button>
      )}

      {activeTemplates.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {activeTemplates.map((t) => (
            <TemplateCard key={t.id} template={t} isManager={isManager} onEdit={handleEdit} />
          ))}
        </div>
      ) : (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps-l)",
            padding: "var(--space-4)",
            border: "1px dashed var(--border-hairline)",
            borderRadius: "var(--radius-xs)",
            textAlign: "center",
          }}
        >
          No Session Templates Yet
        </div>
      )}

      <TemplateFormDialog
        gymId={gymId}
        template={editTemplate}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </div>
  );
}
