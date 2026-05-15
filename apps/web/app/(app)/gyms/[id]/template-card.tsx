"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Pencil, Trash2, Loader2 } from "lucide-react";
import { Plate } from "@/components/ui/elo-system";
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
  const meta = `${DAYS[template.day_of_week]} · ${timeDisplay} · ${template.duration_minutes}min${
    template.max_participants ? ` · Max ${template.max_participants}` : ""
  }`;

  return (
    <Plate>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "var(--size-heading-s)",
              fontWeight: 700,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.15,
            }}
          >
            {template.title}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--size-num-xs)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "var(--ls-caps-l)",
              marginTop: 2,
            }}
          >
            {meta}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          <IconButton onClick={handleCreateSession} disabled={creating} ariaLabel="Start session from template">
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </IconButton>
          {isManager && (
            <>
              <IconButton onClick={() => onEdit(template)} ariaLabel="Edit template">
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton onClick={handleDelete} disabled={deleting} ariaLabel="Delete template" tone="danger">
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </IconButton>
            </>
          )}
        </div>
      </div>
    </Plate>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  ariaLabel,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        width: 28,
        height: 28,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-xs)",
        color: tone === "danger" ? "var(--state-negative)" : "var(--text-secondary)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
