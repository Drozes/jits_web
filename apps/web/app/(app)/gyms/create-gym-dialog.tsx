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
import { createGym } from "@jits/shared/api/mutations";

export function CreateGymDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !city.trim()) return;
    setLoading(true);

    const supabase = createClient();
    const result = await createGym(supabase, {
      name: name.trim(),
      city: city.trim(),
    });

    if (result.ok) {
      toast.success("Gym created");
      setOpen(false);
      setName("");
      setCity("");
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          style={{
            display: "inline-flex",
            alignItems: "center",
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
            whiteSpace: "nowrap",
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          New Gym
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Gym</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gym-name">Name</Label>
            <Input
              id="gym-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gracie Barra Downtown"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gym-city">City</Label>
            <Input
              id="gym-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Austin, TX"
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading || !name.trim() || !city.trim()} className="w-full sm:w-auto">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Gym
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
