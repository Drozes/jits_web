"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Category = "bug" | "feature" | "general";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature Request" },
  { value: "general", label: "General Feedback" },
];

export function FeedbackForm() {
  const [category, setCategory] = useState<Category>("general");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const charCount = message.length;
  const isValid = charCount >= 10 && charCount <= 2000;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("feedback").insert({
      athlete_id: user?.id ?? null,
      category,
      message,
    });

    setSubmitting(false);

    if (error) {
      toast.error("Could not submit feedback. Please try again.");
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <p className="text-2xl">Thank you!</p>
        <p className="text-muted-foreground text-sm">
          Your feedback helps us improve ELO RATED.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setMessage("");
            setCategory("general");
            setSubmitted(false);
          }}
        >
          Submit More Feedback
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>Category</Label>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                category === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent text-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you think..."
          rows={6}
          maxLength={2000}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none"
        />
        <p className={cn("text-xs text-right", charCount > 2000 ? "text-destructive" : "text-muted-foreground")}>
          {charCount}/2000
        </p>
      </div>

      <Button type="submit" disabled={!isValid || submitting} className="w-full">
        {submitting ? "Submitting..." : "Submit Feedback"}
      </Button>
    </form>
  );
}
