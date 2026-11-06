// Exercise swaps: a lifter replaces a programmed exercise for one day or for the rest of the block.
// Pure helpers shared by the browser pages and the coach review route.

export type ExerciseSwap = {
  id: string;
  program_exercise_id: string;
  exercise_name: string;
  start_date: string; // ISO date
  end_date: string | null; // ISO date; NULL = until the block ends
  created_at: string;
};

/** The swap in force for one programmed exercise on an ISO date: the latest one started by then that hasn't ended. */
export function swapFor(
  swaps: ExerciseSwap[] | undefined,
  programExerciseId: string,
  date: string,
): ExerciseSwap | undefined {
  let pick: ExerciseSwap | undefined;
  for (const s of swaps ?? []) {
    if (s.program_exercise_id !== programExerciseId) continue;
    if (s.start_date > date || (s.end_date !== null && s.end_date < date)) continue;
    if (
      !pick ||
      s.start_date > pick.start_date ||
      (s.start_date === pick.start_date && s.created_at > pick.created_at)
    )
      pick = s;
  }
  return pick;
}

export type Swapped<T> = T & { programmed_name: string; swap?: ExerciseSwap };

/**
 * The day's exercises with that date's swaps applied. A swapped exercise takes the new name (so its sets,
 * history and video follow the exercise actually done) but keeps the programmed sets, reps, tempo and rest.
 */
export function applySwaps<T extends { id: string; name: string }>(
  exercises: T[],
  swaps: ExerciseSwap[] | undefined,
  date: string,
): Swapped<T>[] {
  return exercises.map((e) => {
    const s = swapFor(swaps, e.id, date);
    return s ? { ...e, name: s.exercise_name, programmed_name: e.name, swap: s } : { ...e, programmed_name: e.name };
  });
}

/** Tidy a typed exercise name: trimmed, single spaces, at most 80 characters (the database limit). */
export const cleanExerciseName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 80);
