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

## NSS architecture
- Program content (programs/program_days/program_exercises) is read-only from the client and fully data-driven; never hard-code exercises in components.
- Exercise history keys on `set_logs.exercise_key` (lower-cased, trimmed name) so it carries across program blocks.
- workout_sessions and set_logs are readable by every signed-in user (shared leaderboards); every personal query (history, Last, Working Max, charts) must filter by the current user_id. Writes stay owner-only. profiles holds only public fields (no email).
- All signed-in pages live under `src/routes/_authenticated/` and query the database from the browser client with RLS. Pages with child detail routes use `x.index.tsx` so the list file is not a layout.
- Session runner persists each set immediately (upsert on session_id+exercise_key+set_number) so nothing is lost mid-session.

- Derive every installed-app icon and favicon from the shared NSS logo asset so the brand stays consistent across app placements.
- Exercise demos use read-only exercise_media keyed by normKey and one shared player sheet for Training and session pages; unmount its iframe on close to stop playback without changing logging state.
- Timers live in one module-level store (src/lib/timers.ts) computed from wall-clock deltas, so only one timer runs at a time and it survives route changes and backgrounding.
- Chat access is gated by SECURITY DEFINER `is_member`; clients never insert conversation_members (DMs only via `get_or_create_dm`), and workout posts are deduped by a unique index on messages.workout_session_id.
