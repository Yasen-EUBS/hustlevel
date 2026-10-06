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

## Titan Log architecture
- Program content (programs/program_days/program_exercises) is read-only from the client and fully data-driven; never hard-code exercises in components.
- Exercise history keys on `set_logs.exercise_key` (lower-cased, trimmed name) so it carries across program blocks.
- All signed-in pages live under `src/routes/_authenticated/` and query the database from the browser client with RLS; there are no server functions yet.
- Session runner persists each set immediately (upsert on session_id+exercise_key+set_number) so nothing is lost mid-session.
