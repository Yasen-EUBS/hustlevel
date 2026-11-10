CREATE TABLE IF NOT EXISTS public.nutrition_profiles (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sex text, age int, height_cm numeric, weight_kg numeric, activity text, training_days int,
  goal text, pace text, notes text, calories int, protein_g int, carbs_g int, fat_g int,
  plan_summary text, plan_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_profiles TO authenticated;
GRANT ALL ON public.nutrition_profiles TO service_role;
ALTER TABLE public.nutrition_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "np own select" ON public.nutrition_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "np own insert" ON public.nutrition_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "np own update" ON public.nutrition_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "np own delete" ON public.nutrition_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  eaten_on date NOT NULL,
  name text NOT NULL,
  calories int NOT NULL CHECK (calories BETWEEN 0 AND 10000),
  protein_g numeric NOT NULL DEFAULT 0 CHECK (protein_g BETWEEN 0 AND 1000),
  carbs_g numeric NOT NULL DEFAULT 0 CHECK (carbs_g BETWEEN 0 AND 1000),
  fat_g numeric NOT NULL DEFAULT 0 CHECK (fat_g BETWEEN 0 AND 1000),
  note text,
  source text CHECK (source IN ('photo','text','manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meals_user_day ON public.meals (user_id, eaten_on);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meals TO authenticated;
GRANT ALL ON public.meals TO service_role;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meals own select" ON public.meals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "meals own insert" ON public.meals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meals own update" ON public.meals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meals own delete" ON public.meals FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.ai_calls DROP CONSTRAINT IF EXISTS ai_calls_kind_check;
ALTER TABLE public.ai_calls ADD CONSTRAINT ai_calls_kind_check CHECK (kind IN ('program_import','coach_summary','nutrition_plan','meal_estimate'));