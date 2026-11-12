-- Logged-out visitors get nothing on the shared tables (RLS already blocked them; this removes the grants too).
REVOKE ALL ON public.programs, public.program_days, public.program_exercises, public.exercise_media, public.profiles FROM anon;

-- Program content and exercise videos are read-only for signed-in users; writes happen only via SECURITY DEFINER functions.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.programs, public.program_days, public.program_exercises, public.exercise_media FROM authenticated;
GRANT SELECT ON public.programs, public.program_days, public.program_exercises, public.exercise_media TO authenticated;

-- Profiles: signed-in users read display names and upsert only their own row (RLS enforces auth.uid() = id).
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

GRANT ALL ON public.programs, public.program_days, public.program_exercises, public.exercise_media, public.profiles TO service_role;