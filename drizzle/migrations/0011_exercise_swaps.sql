-- Lifters can swap a programmed exercise for another one, for one day or for the rest of the block.
CREATE TABLE IF NOT EXISTS public.exercise_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  program_exercise_id uuid NOT NULL REFERENCES public.program_exercises(id) ON DELETE CASCADE,
  exercise_name text NOT NULL CHECK (char_length(btrim(exercise_name)) BETWEEN 1 AND 80),
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_swaps_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS exercise_swaps_user_slot_idx ON public.exercise_swaps (user_id, program_exercise_id, start_date);
ALTER TABLE public.exercise_swaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exercise_swaps FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_swaps TO authenticated;
GRANT ALL ON public.exercise_swaps TO service_role;
CREATE POLICY "swaps own select" ON public.exercise_swaps FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "swaps own insert" ON public.exercise_swaps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "swaps own update" ON public.exercise_swaps FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "swaps own delete" ON public.exercise_swaps FOR DELETE TO authenticated USING (auth.uid() = user_id);