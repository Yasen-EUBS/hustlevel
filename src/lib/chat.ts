import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SQUAD_ID = "11111111-1111-4111-8111-111111111111";
export const REACTIONS = ["🔥", "💪", "😂", "👏", "❤️"] as const;
export const IMAGE_MAX = 10 * 1024 * 1024;
export const VIDEO_MAX = 50 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 65;

export type WorkoutPost = { title: string; duration_sec: number; reps: number; volume: number; prs: { name: string; kg: number }[] };

export function parseWorkout(body: string): WorkoutPost | null {
  try {
    const p = JSON.parse(body);
    return p && typeof p === "object" ? (p as WorkoutPost) : null;
  } catch {
    return null;
  }
}

export async function fetchConversations() {
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) throw error;
  return (data ?? []).sort((a, b) => {
    if (a.type === "group" && b.type !== "group") return -1;
    if (b.type === "group" && a.type !== "group") return 1;
    return b.last_at.localeCompare(a.last_at);
  });
}

export function useConversations() {
  return useQuery({ queryKey: ["conversations"], queryFn: fetchConversations });
}

/** Keeps chat queries fresh while mounted. One subscription per caller; removed on unmount. */
export function useChatRealtime(name: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`chat-${name}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["messages"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [name, qc]);
}

/** Downscale an image to max 1600px on the long edge, re-encoded as JPEG. */
export async function downscaleImage(file: File, maxSide = 1600): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function videoDuration(file: File): Promise<number> {
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      res(v.duration || 0);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      res(0);
    };
    v.src = url;
  });
}

export function useSignedUrl(path: string | null) {
  return useQuery({
    queryKey: ["signed", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export const initial = (name?: string | null) => (name?.trim()?.[0] ?? "A").toUpperCase();
