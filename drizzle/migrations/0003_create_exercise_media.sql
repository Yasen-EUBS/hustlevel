CREATE TABLE public.exercise_media (
  exercise_key text PRIMARY KEY,
  youtube_id text NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_media_normalized_key CHECK (exercise_key = lower(trim(exercise_key)) AND exercise_key <> ''),
  CONSTRAINT exercise_media_valid_youtube_id CHECK (youtube_id ~ '^[A-Za-z0-9_-]{11}$')
);
GRANT SELECT ON public.exercise_media TO authenticated;
GRANT ALL ON public.exercise_media TO service_role;
ALTER TABLE public.exercise_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users can read exercise media" ON public.exercise_media FOR SELECT TO authenticated USING (true);