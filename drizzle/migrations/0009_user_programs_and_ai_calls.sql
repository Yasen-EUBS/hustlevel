-- Who imported a program (NULL = the built-in default program)
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
-- The program each user follows (NULL = the default is_active program)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL;
-- AI coach review saved per finished workout
ALTER TABLE public.workout_sessions ADD COLUMN IF NOT EXISTS coach_summary text;

-- Rate-limit log for AI features
CREATE TABLE IF NOT EXISTS public.ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('program_import', 'coach_summary')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_calls_user_kind_time ON public.ai_calls (user_id, kind, created_at);
ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_calls FROM anon, authenticated;
GRANT SELECT, INSERT ON public.ai_calls TO authenticated;
GRANT ALL ON public.ai_calls TO service_role;
CREATE POLICY "ai_calls own select" ON public.ai_calls FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ai_calls own insert" ON public.ai_calls FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Program tables stay read-only for clients; imports go through this validated, atomic function.
CREATE OR REPLACE FUNCTION public.import_program(p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  pid uuid;
  did uuid;
  d jsonb;
  day_i int := 0;
  recent int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT count(*) INTO recent FROM programs WHERE created_by = uid AND created_at > now() - interval '1 day';
  IF recent >= 10 THEN RAISE EXCEPTION 'Too many imports today. Try again tomorrow.'; END IF;
  IF jsonb_typeof(p->'days') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'days') NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'A program needs 1 to 7 training days';
  END IF;
  IF (SELECT count(DISTINCT x->>'weekday') FROM jsonb_array_elements(p->'days') x) <> jsonb_array_length(p->'days') THEN
    RAISE EXCEPTION 'Each training day needs its own weekday';
  END IF;

  INSERT INTO programs (name, block_name, start_date, total_weeks, coach_notes, is_active, created_by)
  VALUES (
    left(coalesce(nullif(trim(p->>'name'), ''), 'My program'), 80),
    left(coalesce(nullif(trim(p->>'block_name'), ''), 'Block 1'), 80),
    CASE WHEN p->>'start_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (p->>'start_date')::date ELSE date_trunc('week', now())::date END,
    CASE WHEN p->>'total_weeks' ~ '^\d{1,2}$' THEN least(greatest((p->>'total_weeks')::int, 1), 52) ELSE 8 END,
    left(nullif(trim(p->>'coach_notes'), ''), 4000),
    false,
    uid)
  RETURNING id INTO pid;

  FOR d IN SELECT * FROM jsonb_array_elements(p->'days') LOOP
    day_i := day_i + 1;
    IF NOT (d->>'weekday' ~ '^[1-7]$') THEN RAISE EXCEPTION 'Weekday must be 1 (Mon) to 7 (Sun)'; END IF;
    IF jsonb_typeof(d->'exercises') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'exercises') NOT BETWEEN 1 AND 25 THEN
      RAISE EXCEPTION 'Each day needs 1 to 25 exercises';
    END IF;
    INSERT INTO program_days (program_id, weekday, title, day_notes, sort_order)
    VALUES (pid, (d->>'weekday')::int, left(coalesce(nullif(trim(d->>'title'), ''), 'Day ' || day_i), 80),
            left(nullif(trim(d->>'day_notes'), ''), 2000), day_i)
    RETURNING id INTO did;

    INSERT INTO program_exercises (program_day_id, letter, section, name, sets, rep_min, rep_max, duration_seconds, tempo, rest_min_seconds, rest_max_seconds, note)
    SELECT did,
      chr(64 + t.ord::int),
      CASE WHEN upper(coalesce(t.x->>'section', '')) = 'RECOVERY' THEN 'RECOVERY' ELSE 'STRENGTH/POWER' END,
      left(trim(t.x->>'name'), 80),
      CASE WHEN t.x->>'sets' ~ '^\d{1,2}$' THEN least(greatest((t.x->>'sets')::int, 1), 10) ELSE 3 END,
      CASE WHEN t.x->>'rep_min' ~ '^\d{1,3}$' THEN least(greatest((t.x->>'rep_min')::int, 1), 100) END,
      CASE WHEN t.x->>'rep_max' ~ '^\d{1,3}$' THEN least(greatest((t.x->>'rep_max')::int, 1), 100) END,
      CASE WHEN t.x->>'duration_seconds' ~ '^\d{1,5}$' THEN least(greatest((t.x->>'duration_seconds')::int, 1), 7200) END,
      left(nullif(trim(t.x->>'tempo'), ''), 20),
      CASE WHEN t.x->>'rest_min_seconds' ~ '^\d{1,4}$' THEN least((t.x->>'rest_min_seconds')::int, 900) ELSE 120 END,
      CASE WHEN t.x->>'rest_max_seconds' ~ '^\d{1,4}$' THEN least((t.x->>'rest_max_seconds')::int, 900) ELSE 120 END,
      left(nullif(trim(t.x->>'note'), ''), 500)
    FROM jsonb_array_elements(d->'exercises') WITH ORDINALITY AS t(x, ord)
    WHERE coalesce(trim(t.x->>'name'), '') <> '';
  END LOOP;

  -- Fix inverted ranges
  UPDATE program_exercises SET rep_min = rep_max, rep_max = rep_min
  WHERE program_day_id IN (SELECT id FROM program_days WHERE program_id = pid) AND rep_min > rep_max;
  UPDATE program_exercises SET rest_max_seconds = rest_min_seconds
  WHERE program_day_id IN (SELECT id FROM program_days WHERE program_id = pid) AND rest_max_seconds < rest_min_seconds;

  INSERT INTO profiles (id, program_id) VALUES (uid, pid)
  ON CONFLICT (id) DO UPDATE SET program_id = excluded.program_id;
  RETURN pid;
END
$$;
REVOKE ALL ON FUNCTION public.import_program(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.import_program(jsonb) TO authenticated;