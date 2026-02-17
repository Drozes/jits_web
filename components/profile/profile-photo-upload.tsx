"use client";

import { useState, useRef } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getInitials, getProfilePhotoUrl } from "@/lib/utils";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

interface ProfilePhotoUploadProps {
  athleteId: string;
  displayName: string;
  profilePhotoUrl: string | null;
}

export function ProfilePhotoUpload({
  athleteId,
  displayName,
  profilePhotoUrl,
}: ProfilePhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [photoPath, setPhotoPath] = useState(profilePhotoUrl);
  const [cacheBuster, setCacheBuster] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const displayUrl = getProfilePhotoUrl(photoPath, cacheBuster);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Please select a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Image must be under 5 MB");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const filePath = `${athleteId}/profile.${ext}`;

    try {
      // Remove old file if extension changed (avoids orphans)
      if (photoPath && photoPath !== filePath) {
        await supabase.storage.from("athlete-photos").remove([photoPath]);
      }

      const { error: uploadErr } = await supabase.storage
        .from("athlete-photos")
        .upload(filePath, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { error: updateErr } = await supabase
        .from("athletes")
        .update({ profile_photo_url: filePath })
        .eq("id", athleteId);
      if (updateErr) throw updateErr;

      setPhotoPath(filePath);
      setCacheBuster(Date.now());
      toast.success("Photo updated");
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!photoPath) return;
    setUploading(true);
    const supabase = createClient();

    try {
      await supabase.storage.from("athlete-photos").remove([photoPath]);
      await supabase
        .from("athletes")
        .update({ profile_photo_url: null })
        .eq("id", athleteId);

      setPhotoPath(null);
      toast.success("Photo removed");
    } catch {
      toast.error("Failed to remove photo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Avatar className="h-20 w-20 bg-gradient-to-br from-primary to-red-600 text-white border-2 border-muted shadow-md">
            {displayUrl && (
              <AvatarImage
                src={displayUrl}
                alt={displayName}
                className="object-cover"
              />
            )}
            <AvatarFallback className="text-xl bg-gradient-to-br from-primary to-red-600 text-white">
              {getInitials(displayName || "?")}
            </AvatarFallback>
          </Avatar>

          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
            {uploading ? (
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            ) : (
              <Camera className="h-6 w-6 text-white" />
            )}
          </span>
        </button>

        {photoPath && !uploading && (
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-1 -right-1 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm hover:bg-destructive/90"
            aria-label="Remove photo"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />

      <p className="text-xs text-muted-foreground">
        {uploading ? "Uploading\u2026" : "Tap to add photo"}
      </p>
    </div>
  );
}
