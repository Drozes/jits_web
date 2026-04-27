"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSend: (body: string) => Promise<void>;
  onTyping: () => void;
  isSending: boolean;
}

const MAX_CHARS = 2000;

export function MessageInput({ onSend, onTyping, isSending }: MessageInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || isSending) return;
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await onSend(trimmed);
  }, [value, isSending, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      if (next.length > MAX_CHARS) return;
      setValue(next);
      onTyping();

      // Auto-grow textarea (max ~4 lines)
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
    },
    [onTyping],
  );

  const isNearLimit = value.length > MAX_CHARS - 100;
  const canSend = value.trim().length > 0 && !isSending;

  return (
    <div className="border-t bg-background px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      {isNearLimit && (
        <p className="text-[10px] text-muted-foreground text-right mb-1">
          {value.length}/{MAX_CHARS}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          className="flex-1 resize-none rounded-lg border bg-muted/50 px-3 py-2 text-base md:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
            canSend
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground",
          )}
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
