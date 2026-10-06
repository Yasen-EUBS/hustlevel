REVOKE ALL ON public.exercise_media FROM anon, authenticated;
GRANT SELECT ON public.exercise_media TO authenticated;
GRANT ALL ON public.exercise_media TO service_role;