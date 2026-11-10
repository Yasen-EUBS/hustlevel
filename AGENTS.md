<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## HustLevel architecture
- Program content (programs/program_days/program_exercises) is read-only from the client and fully data-driven; new programs are created only through the validated SECURITY DEFINER `import_program` RPC (screenshot import). Each user follows `profiles.program_id` (NULL = the default `is_active` program; a previous built-in block, kept with `is_active = false` and listed as "Previous block", or an imported program is pinned by id) and `fetchActiveProgram` resolves it; never hard-code exercises in components. Training reads `["program-timeline"]` (`fetchProgramTimeline` + `blockFor`): on the default every built-in block shows on its own dates (latest block started by that date), while a pinned program repeats on every date. The session runner loads the day's own block via `fetchProgramOfDay`, so past sessions open with the exercises that ran then.
- Progression rules (double progression on the rep range) live in `src/lib/progression.ts` as pure functions shared by the session hints and `/api/coach-summary`; never duplicate them. AI server routes use `src/lib/server/ai.ts` (caller-JWT Supabase client so RLS applies, `ai_calls` daily quota) and must stay grounded in data passed to the model.
- The shared AI helper uses the Gateway SDK with unchanged per-endpoint output budgets and rejects truncated completions so partial coach text is never saved as a finished review.
- Exercise history keys on `set_logs.exercise_key` (lower-cased, trimmed name) so it carries across program blocks.
- Exercise swaps live in owner-only `exercise_swaps` (program_exercise_id, exercise_name, start_date, end_date; NULL end = rest of the block). `applySwaps`/`swapFor` in `src/lib/swaps.ts` (pure, shared with `/api/coach-summary`) resolve the swap in force for a date: the swapped exercise takes the new name (sets, history, video, Training list) but keeps the programmed sets/reps/tempo/rest. Swapping or undoing moves that session's logged sets and note to the new key; undo deletes a swap started that day or ends an older one the day before.
- workout_sessions and set_logs are readable by their owner and, for everyone else, only when the owner shares (`profiles.share_workouts`, checked by `shares_workouts()` in RLS; new accounts start private). Leaderboards therefore list only sharing lifters. Every personal query (history, Last, Working Max, charts) must still filter by the current user_id. AI coach reviews live in owner-only `session_reviews`; `workout_sessions.coach_summary` is deprecated and must not be used. Writes stay owner-only. profiles holds only public fields (no email).
- All signed-in pages live under `src/routes/_authenticated/` and query the database from the browser client with RLS. Pages with child detail routes use `x.index.tsx` so the list file is not a layout.
- Session runner persists each set immediately (upsert on session_id+exercise_key+set_number) so nothing is lost mid-session.

- Render the brand through HustLevelLogo/HustLevelMark and semantic CSS tokens; use the supplied SVG favicon/app mark and preserve PNG icon paths for replacement uploads so placements stay consistent.
- Rebrand legacy program/group names only in presentation; preserve database values, persisted storage keys, mobile application IDs and signing identifiers so existing data and installs remain compatible.
- Exercise demos use read-only exercise_media keyed by normKey and one shared player sheet for Training and session pages; unmount its iframe on close to stop playback without changing logging state.
- Timers live in one module-level store (src/lib/timers.ts) computed from wall-clock deltas, so only one timer runs at a time and it survives route changes and backgrounding.
- Chat access is gated by SECURITY DEFINER `is_member`; clients never insert conversation_members (DMs only via `get_or_create_dm`), and workout posts are deduped by a unique index on messages.workout_session_id.
- A React Query key must always map to one fetcher and one data shape. Reuse `fetchActiveProgram` for `["program"]`; never cache a partial select under a shared key (it crashed Training after visiting Me).
- The published web address is https://hustlevel.lovable.app. Always publish with slug `hustlevel`; publishing with any other slug moves the live app to a different address and breaks every installed home-screen app and the Android shell.
- Calorie tracker (/food): owner-only `nutrition_profiles` and `meals` (RLS auth.uid() = user_id, never subject to share_workouts) must never feed leaderboards, chat, workout posts or the coach review. `/api/nutrition-plan` lets the AI pick targets, then `applyRails` in `src/lib/nutrition.ts` (pure, also used for manual edits) enforces safe calorie/macro bounds; `/api/meal-estimate` discards photos after estimating — no food photo is ever stored.
