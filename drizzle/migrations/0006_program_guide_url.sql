ALTER TABLE public.programs ADD COLUMN guide_url text;

UPDATE public.programs SET guide_url = '/hypertrophy-guide.pdf' WHERE is_active = true AND guide_url IS NULL;

COMMENT ON COLUMN public.programs.guide_url IS $$Optional URL to the program training guide, shown on the Training and Me tabs.$$;
