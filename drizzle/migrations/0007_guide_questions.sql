CREATE TABLE public.guide_questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX guide_questions_user_time ON public.guide_questions (user_id, created_at);
GRANT SELECT, INSERT ON public.guide_questions TO authenticated;
GRANT ALL ON public.guide_questions TO service_role;
ALTER TABLE public.guide_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.guide_questions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.guide_questions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);