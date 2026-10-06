CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  block_name text NOT NULL,
  start_date date NOT NULL,
  total_weeks int NOT NULL,
  coach_notes text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.program_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  title text NOT NULL,
  day_notes text,
  sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE public.program_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_day_id uuid NOT NULL REFERENCES public.program_days(id) ON DELETE CASCADE,
  letter text NOT NULL,
  section text NOT NULL DEFAULT 'STRENGTH/POWER',
  name text NOT NULL,
  sets int NOT NULL DEFAULT 1,
  rep_min int,
  rep_max int,
  duration_seconds int,
  tempo text,
  rest_min_seconds int NOT NULL DEFAULT 120,
  rest_max_seconds int NOT NULL DEFAULT 120,
  note text
);
GRANT SELECT ON public.programs, public.program_days, public.program_exercises TO authenticated;
GRANT ALL ON public.programs, public.program_days, public.program_exercises TO service_role;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read programs" ON public.programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "read days" ON public.program_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "read exercises" ON public.program_exercises FOR SELECT TO authenticated USING (true);

CREATE TABLE public.workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  program_day_id uuid REFERENCES public.program_days(id) ON DELETE SET NULL,
  day_title text,
  session_date date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text
);
CREATE INDEX ON public.workout_sessions (user_id, session_date);
CREATE TABLE public.set_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  session_id uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  exercise_key text NOT NULL,
  set_number int NOT NULL,
  reps int,
  weight_kg numeric,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, exercise_key, set_number)
);
CREATE INDEX ON public.set_logs (user_id, exercise_key);
CREATE TABLE public.exercise_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  session_id uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_key text NOT NULL,
  note text NOT NULL DEFAULT '',
  UNIQUE (session_id, exercise_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_sessions, public.set_logs, public.exercise_notes TO authenticated;
GRANT ALL ON public.workout_sessions, public.set_logs, public.exercise_notes TO service_role;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.set_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.workout_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sets" ON public.set_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notes" ON public.exercise_notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed program
DO $$
DECLARE p uuid; d uuid; wd int;
BEGIN
  INSERT INTO public.programs (name, block_name, start_date, total_weeks, coach_notes, is_active)
  VALUES ('Titan Build – 3 Day', 'Intensity Phase 1', '2026-09-07', 8,
  'The first set of each exercise is your priority set – you''re least fatigued, so aim to lift the most here. Try to beat your previous session for each set. Pick a weight where you reach the bottom of the rep range with 1–2 reps in reserve (e.g. 8–12 → about 9–10 reps before failure). Later sets are done at the same effort: adjust the load so you stay within the written rep range. Take the last set of each exercise to failure. This block focuses on delts & back, and is one of the few blocks that also prioritizes legs.', true)
  RETURNING id INTO p;

  INSERT INTO public.program_days (program_id, weekday, title, sort_order) VALUES (p, 1, 'UPPER - Intensity Phase 1', 1) RETURNING id INTO d;
  INSERT INTO public.program_exercises (program_day_id, letter, section, name, sets, rep_min, rep_max, tempo, rest_min_seconds, rest_max_seconds) VALUES
  (d,'A','STRENGTH/POWER','Unilateral Lat Bias Pullaround',2,6,10,'3-0-1-0',120,180),
  (d,'B','STRENGTH/POWER','Kelso Shrug',2,6,10,'1-0-1-0',120,180),
  (d,'C','STRENGTH/POWER','Neutral Grip Overhead Press',2,8,12,'2-0-1-0',120,120),
  (d,'D','STRENGTH/POWER','Press Deck',2,8,12,'3-0-1-0',120,180),
  (d,'E','STRENGTH/POWER','Kneeling Pushdown',2,8,12,'2-0-1-0',120,120),
  (d,'F','STRENGTH/POWER','Mid Range Cable Curl',2,8,12,'2-0-1-0',120,120),
  (d,'G','STRENGTH/POWER','Mid Range Cable Lateral Raise',2,8,12,'2-0-1-0',120,120);

  FOREACH wd IN ARRAY ARRAY[2,4,6] LOOP
    INSERT INTO public.program_days (program_id, weekday, title, day_notes, sort_order) VALUES (p, wd, 'REST DAY', 'Today is a rest day!', wd) RETURNING id INTO d;
    INSERT INTO public.program_exercises (program_day_id, letter, section, name, sets, duration_seconds, rest_min_seconds, rest_max_seconds) VALUES (d,'A','RECOVERY','Cardio',1,2100,120,120);
  END LOOP;

  INSERT INTO public.program_days (program_id, weekday, title, sort_order) VALUES (p, 3, 'LOWER - Intensity Phase 1', 3) RETURNING id INTO d;
  INSERT INTO public.program_exercises (program_day_id, letter, section, name, sets, rep_min, rep_max, tempo, rest_min_seconds, rest_max_seconds, note) VALUES
  (d,'A','STRENGTH/POWER','Seated Lat Bias Row',1,6,10,'2-0-1-0',120,180,'Can be done chest supported using the same arm path'),
  (d,'B','STRENGTH/POWER','Converging Flat Press',2,6,10,'3-0-1-0',120,180,NULL),
  (d,'C','STRENGTH/POWER','Leg Extensions',2,8,12,'2-0-1-0',120,120,NULL),
  (d,'D','STRENGTH/POWER','Straight Leg Calf Raises',3,8,12,'2-2-1-0',120,180,NULL),
  (d,'E','STRENGTH/POWER','Bilateral Adductor/Quad Leg Press',2,6,10,'3-0-1-0',180,240,NULL),
  (d,'F','STRENGTH/POWER','Glute Bridge',2,6,10,'3-0-1-0',180,240,NULL),
  (d,'G','STRENGTH/POWER','Seated Hamstring Curls',1,8,12,'2-0-1-0',120,180,NULL),
  (d,'H','STRENGTH/POWER','Half Bosu Crunch',2,8,12,'2-0-1-0',120,120,NULL);

  INSERT INTO public.program_days (program_id, weekday, title, sort_order) VALUES (p, 5, 'FULL BODY - Intensity Phase 1', 5) RETURNING id INTO d;
  INSERT INTO public.program_exercises (program_day_id, letter, section, name, sets, rep_min, rep_max, tempo, rest_min_seconds, rest_max_seconds) VALUES
  (d,'A','STRENGTH/POWER','Pull Up',2,6,10,'3-0-1-0',120,180),
  (d,'B','STRENGTH/POWER','Chest Supported Front Raise',2,8,12,'2-2-1-0',120,120),
  (d,'C','STRENGTH/POWER','Upper Back Row',2,6,10,'2-0-1-0',180,180),
  (d,'D','STRENGTH/POWER','Machine Lateral Raise',2,8,12,'2-0-1-0',120,120),
  (d,'E','STRENGTH/POWER','Kneeling Pushdown',2,8,12,'2-0-1-0',120,120),
  (d,'F','STRENGTH/POWER','Mid Range Cable Curl',2,8,12,'2-0-1-0',120,120),
  (d,'G','STRENGTH/POWER','Leg Extensions',2,6,10,'2-0-1-0',120,120),
  (d,'H','STRENGTH/POWER','Seated Hamstring Curls',2,6,10,'2-0-1-0',120,120);
END $$;