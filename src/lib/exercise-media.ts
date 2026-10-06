import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ExerciseMedia = Database["public"]["Tables"]["exercise_media"]["Row"];

export function useExerciseMedia() {
  return useQuery({
    queryKey: ["exercise-media"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercise_media").select("*");
      if (error) throw error;
      return Object.fromEntries(data.map((media) => [media.exercise_key, media]));
    },
  });
}