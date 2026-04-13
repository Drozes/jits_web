"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface UseVideoRecorderReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  uploadStatus: "idle" | "uploading" | "done" | "error";
  error: string | null;
}

export function useVideoRecorder(matchId: string): UseVideoRecorderReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (blob: Blob) => {
    setUploadStatus("uploading");
    try {
      const supabase = createClient();
      const path = `matches/${matchId}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from("match-videos").upload(path, blob);
      setUploadStatus(uploadError ? "error" : "done");
      if (uploadError) setError(uploadError.message);
    } catch {
      setUploadStatus("error");
      setError("Upload failed");
    }
  }, [matchId]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 854, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      setError(null);
    } catch {
      setError("Camera access denied. You can still manage the match without video.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        if (blob.size > 0) upload(blob);
      };
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, [upload]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, isRecording, startRecording, stopRecording, uploadStatus, error };
}
