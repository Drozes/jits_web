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
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Create Gym
        </Button>
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
