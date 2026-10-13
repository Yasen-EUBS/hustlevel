# Titan Strength Logger

Build "Titan Log", a mobile-first strength-training logger that people add to their iPhone home screen (iOS Safari). It is modeled on the TrainHeroic athlete app. Use Lovable Cloud for the database and auth. Everything is in kg.

## Users & auth
- Email + password sign-up and login. Each user sees only their own logs (RLS on every user table).
- All users follow the SAME program, which is stored in the database. Program tables are readable by any authenticated user and NOT writable from the client. I will update the program myself through the backend every ~8–13 weeks, so program content must be 100% data-driven (no hard-coded exercises in components).
- Make exercise history follow the exercise NAME (normalized: lower-case, trimmed), not a row id, so a lift's history carries over when a new block reuses the same exercise.

## Data model (suggested)
- programs: id, name ("Titan Build – 3 Day"), block_name ("Intensity Phase 1"), start_date, total_weeks, coach_notes (general instructions shown on every training day), is_active
- program_days: id, program_id, weekday (1=Mon…7=Sun), title (e.g. "UPPER - Intensity Phase 1" or "REST DAY"), day_notes, sort_order
- program_exercises: id, program_day_id, letter (A, B, C…), section ("STRENGTH/POWER" or "RECOVERY"), name, sets, rep_min, rep_max (nullable), duration_seconds (nullable, for cardio), tempo (text like "3-0-1-0", nullable), rest_min_seconds, rest_max_seconds, note (nullable)
- workout_sessions: id, user_id, program_day_id, session_date, started_at, completed_at, notes
- set_logs: id, user_id, session_id, exercise_name, exercise_key (normalized name), set_number, reps, weight_kg (numeric, allow decimals like 15.9), completed (bool), created_at
- exercise_notes: per user per session per exercise, free text

## Screens (dark UI like TrainHeroic: near-black background, white bold type, periwinkle/blue accent #6B8BF5, green completion rings)
Bottom tab bar: Training, History, Progress, Me.

1. Training (home): month header ("OCT '26" with dropdown), "TODAY" button, horizontal swipeable week strip of dates with a dot under days that have a session. Selecting a date shows the program day for that weekday: program logo tile + program name + day title, big "Start Session" button (or "Resume" / "Completed ✓" if logged), collapsible "Coach Instructions" (program coach_notes + day_notes + "This is week X/Y – block name" computed from start_date), then the list of exercises: section label, letter in a circle, name, and "2 x 6-10" in accent color.

2. Session runner (full screen): top row with a collapse chevron, progress dots (one per exercise, current one large), running totals "N REPS" and "N KG" (total volume). Per exercise page: "A. Strength/Power", exercise name; stats card with WORKING MAX (best estimated 1RM, Epley: weight × (1 + reps/30), rounded to whole number) and LAST (most recent previous session for that exercise, formatted "8, 7 @ 70 kg", or "2 x 7 @ 90 kg" when all sets match, or "—" if none); prescription text ("Reps 2x6-10", "Tempo 3-0-1-0", "Rest 2-3min"); the exercise note if any; a sets table with columns Sets / Reps / Kg and a green circle to tick each set. The reps input shows the rep range as placeholder; kg is pre-filled with the last weight used. "− Set +" buttons to remove/add sets. "Add exercise note" field. Bottom bar: Back, rest timer, Next. Swipe left/right between exercises too. A final "Finish Session" summary page shows totals and any new Working Max PRs, then saves.
   - Rest timer: ticking a set auto-starts a countdown from rest_min_seconds (tap to switch to rest_max). Show it in the bottom bar, vibrate (navigator.vibrate if available) and play a short beep at 0.
   - Save progress as you go (each ticked set is persisted), so closing the app mid-session loses nothing.
   - Cardio/recovery items (duration_seconds) show a simple timer and a "Done" check instead of the sets table.

3. History: list of completed sessions (date, day title, total volume, duration); tapping opens a read-only view of all sets.

4. Progress: searchable list of every exercise the user has logged. Tapping one shows charts over time (Recharts): estimated 1RM per session, top-set weight, and total volume; plus a table of every session's sets and the all-time best set.

5. Me: display name, email, units note (kg), sign out.

## PWA / home screen
- Add a web app manifest (name "Titan Log", short_name "Titan Log", display standalone, dark theme_color/background_color), apple-touch-icon, apple-mobile-web-app-capable and status-bar meta tags, safe-area insets so content sits clear of the notch and home indicator. Manifest only, no service worker.
- Mobile-first layout, large tap targets, numeric keypad (inputmode="decimal") for kg and inputmode="numeric" for reps.

## Seed data: the current program
Program "Titan Build – 3 Day", block "Intensity Phase 1", total_weeks 8, start_date 2026-09-07 (so the week of Oct 5, 2026 is week 5/8), active.
Coach notes (general): "The first set of each exercise is your priority set – you're least fatigued, so aim to lift the most here. Try to beat your previous session for each set. Pick a weight where you reach the bottom of the rep range with 1–2 reps in reserve (e.g. 8–12 → about 9–10 reps before failure). Later sets are done at the same effort: adjust the load so you stay within the written rep range. Take the last set of each exercise to failure. This block focuses on delts & back, and is one of the few blocks that also prioritizes legs."
Rest format: store seconds; "2-3min" = 120/180, "2min" = 120/120, "3min" = 180/180, "3-4min" = 180/240. Where no rest was given use 120/120.

Monday – "UPPER - Intensity Phase 1" (all STRENGTH/POWER):
A Unilateral Lat Bias Pullaround – 2 x 6-10, tempo 3-0-1-0, rest 2-3min
B Kelso Shrug – 2 x 6-10, tempo 1-0-1-0, rest 2-3min
C Neutral Grip Overhead Press – 2 x 8-12, tempo 2-0-1-0, rest 2min
D Press Deck – 2 x 8-12, tempo 3-0-1-0, rest 2-3min
E Kneeling Pushdown – 2 x 8-12, tempo 2-0-1-0, rest 2min
F Mid Range Cable Curl – 2 x 8-12, tempo 2-0-1-0, rest 2min
G Mid Range Cable Lateral Raise – 2 x 8-12, tempo 2-0-1-0, rest 2min

Tuesday, Thursday, Saturday – "REST DAY", day note "Today is a rest day!":
A (RECOVERY) Cardio – 1 x 35:00 (duration_seconds 2100)

Wednesday – "LOWER - Intensity Phase 1" (all STRENGTH/POWER):
A Seated Lat Bias Row – 1 x 6-10, tempo 2-0-1-0, rest 2-3min, note "Can be done chest supported using the same arm path"
B Converging Flat Press – 2 x 6-10, tempo 3-0-1-0, rest 2-3min
C Leg Extensions – 2 x 8-12, tempo 2-0-1-0, rest 2min
D Straight Leg Calf Raises – 3 x 8-12, tempo 2-2-1-0, rest 2-3min
E Bilateral Adductor/Quad Leg Press – 2 x 6-10, tempo 3-0-1-0, rest 3-4min
F Glute Bridge – 2 x 6-10, tempo 3-0-1-0, rest 3-4min
G Seated Hamstring Curls – 1 x 8-12, tempo 2-0-1-0, rest 2-3min
H Half Bosu Crunch – 2 x 8-12, tempo 2-0-1-0, rest 2min

Friday – "FULL BODY - Intensity Phase 1" (all STRENGTH/POWER):
A Pull Up – 2 x 6-10, tempo 3-0-1-0, rest 2-3min
B Chest Supported Front Raise – 2 x 8-12, tempo 2-2-1-0, rest 2min
C Upper Back Row – 2 x 6-10, tempo 2-0-1-0, rest 3min
D Machine Lateral Raise – 2 x 8-12, tempo 2-0-1-0, rest 2min
E Kneeling Pushdown – 2 x 8-12, tempo 2-0-1-0, rest 2min
F Mid Range Cable Curl – 2 x 8-12, tempo 2-0-1-0, rest 2min
G Leg Extensions – 2 x 6-10, tempo 2-0-1-0, rest 2min
H Seated Hamstring Curls – 2 x 6-10, tempo 2-0-1-0, rest 2min

Sunday: no session.

No pre-existing workout history: users start fresh.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://nss-gym.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3f64babe-31b4-4d21-9c5a-91772b922cae).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
