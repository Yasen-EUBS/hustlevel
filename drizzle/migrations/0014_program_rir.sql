-- Reps-in-reserve target per program, shown next to Tempo in a session (e.g. "1–2").
-- rir_week1 optionally overrides it during the block's first week (acclimation week is usually lighter).
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS rir text CHECK (rir IS NULL OR char_length(rir) BETWEEN 1 AND 24),
  ADD COLUMN IF NOT EXISTS rir_week1 text CHECK (rir_week1 IS NULL OR char_length(rir_week1) BETWEEN 1 AND 24);