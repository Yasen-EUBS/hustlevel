-- 1) AI coach reviews become owner-only (moved out of the shared workout_sessions table)
CREATE TABLE IF NOT EXISTS public.session_reviews (
  session_id uuid PRIMARY KEY REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  summary text NOT NULL CHECK (char_length(summary) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.session_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_reviews FROM anon, authenticated;
GRANT SELECT, INSERT ON public.session_reviews TO authenticated;
GRANT ALL ON public.session_reviews TO service_role;
CREATE POLICY "reviews own select" ON public.session_reviews FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "reviews own insert" ON public.session_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.workout_sessions ws WHERE ws.id = session_id AND ws.user_id = auth.uid()));
INSERT INTO public.session_reviews (session_id, user_id, summary)
  SELECT id, user_id, coach_summary FROM public.workout_sessions WHERE coach_summary IS NOT NULL
  ON CONFLICT (session_id) DO NOTHING;
COMMENT ON COLUMN public.workout_sessions.coach_summary IS 'DEPRECATED: replaced by public.session_reviews.summary';

-- 2) Other people's workouts are visible only when their owner shares them (profiles.share_workouts)
CREATE OR REPLACE FUNCTION public.shares_workouts(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce((SELECT share_workouts FROM public.profiles WHERE id = uid), false) $$;
REVOKE ALL ON FUNCTION public.shares_workouts(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shares_workouts(uuid) TO authenticated;

DROP POLICY IF EXISTS "sets readable by signed in" ON public.set_logs;
CREATE POLICY "sets readable by owner or when shared" ON public.set_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.shares_workouts(user_id));
DROP POLICY IF EXISTS "sessions readable by signed in" ON public.workout_sessions;
CREATE POLICY "sessions readable by owner or when shared" ON public.workout_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.shares_workouts(user_id));

-- 3) New accounts start private; existing members keep their current choice
ALTER TABLE public.profiles ALTER COLUMN share_workouts SET DEFAULT false;