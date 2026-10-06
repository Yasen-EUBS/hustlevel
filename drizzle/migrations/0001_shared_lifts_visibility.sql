DROP POLICY IF EXISTS "own sessions" ON public.workout_sessions;
DROP POLICY IF EXISTS "own sets" ON public.set_logs;
CREATE POLICY "sessions readable by signed in" ON public.workout_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "sessions insert own" ON public.workout_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions update own" ON public.workout_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions delete own" ON public.workout_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sets readable by signed in" ON public.set_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "sets insert own" ON public.set_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sets update own" ON public.set_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sets delete own" ON public.set_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- profiles holds only id, display_name, created_at (no email); let signed-in users read names
DROP POLICY IF EXISTS "own profile select" ON public.profiles;
CREATE POLICY "profiles readable by signed in" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS set_logs_key_idx ON public.set_logs (exercise_key);