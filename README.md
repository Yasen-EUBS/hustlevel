<p align="center">
  <img src="docs/logo.svg" alt="HustLevel logo" width="120" height="120">
</p>

<h1 align="center">HustLevel</h1>

<p align="center">
  A training log for a small crew of friends on the same program.<br>
  Log every set, watch your working max climb, and see who's lifting more.
</p>

<p align="center">
  <a href="https://github.com/Yasen-EUBS/nss-gym/releases/latest/download/NSS.apk"><b>Download for Android</b></a> &nbsp;·&nbsp;
  <a href="https://nss-gym.lovable.app"><b>Open on iPhone</b></a> &nbsp;·&nbsp;
  <a href="https://yasen-eubs.github.io/nss-gym/"><b>Project page</b></a>
</p>

---

## Why I built it

My training program runs in TrainHeroic. My friends and I wanted to log the same program side by side, compare numbers on every lift and keep the banter in one place, without each of us paying for a separate app. HustLevel does that for a private group: one shared program, everyone's own logs, and leaderboards for the whole crew.

## Features

- **Session logging:** reps and kg per set, with tempo, rest and coach notes on screen. Every ticked set is saved immediately, so closing the app mid-workout loses nothing.
- **Progress tracking:** per-exercise charts for estimated 1RM (Epley), top-set weight and volume, plus your last session shown as the target.
- **Leaderboards:** every lift ranks all athletes by working max, and you can see friends' last sets while you train.
- **Seven timers:** rest timer (starts automatically when you tick a set), stopwatch, AMRAP, For Time, Tabata, EMOM and custom intervals. Timing uses wall-clock deltas, so it stays accurate when the phone locks.
- **Chat:** a group chat and private DMs with photos, form-check videos and reactions. A finished workout posts a summary card to the group.
- **Demo videos:** a technique video from an evidence-based coach for every exercise.

## Architecture

```
            ┌──────────────────────────┐
            │ Android app (Capacitor)  │──┐
            └──────────────────────────┘  │  loads
            ┌──────────────────────────┐  ├──────────► nss-gym.lovable.app
            │ iPhone home-screen app   │──┘            React 19 + TanStack Start
            └──────────────────────────┘                        │
                                                                ▼
                                   Supabase: Postgres + Row-Level Security
                                             Realtime (chat)
                                             Storage (chat media)
```

**Data-driven program.** The training program lives in the database (`programs`, `program_days`, `program_exercises`). A new 8 to 13 week block is a data update, not a code change. Logs and personal records are keyed by the normalized exercise name, so history carries over between blocks.

**Security model.** Row-level security is enabled on every table:
- Everyone signed in can read workouts and sets, which powers the leaderboards. Only the owner can create, change or delete their own data.
- Profiles expose only a display name, never an email.
- DMs and their media are readable only by the two members. Membership checks run through `SECURITY DEFINER` helpers to avoid RLS recursion.
- Chat media sits in a private bucket and is served through signed URLs.

**One codebase, two install paths.**
- **Android:** the app in [`mobile/`](mobile) is a Capacitor shell that loads the live web app. Updates reach installed phones the moment the site is republished, with no reinstall.
- **iPhone:** HustLevel installs as a web app from Safari's Share menu, with its own icon and full-screen view, so it doesn't need the App Store.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 19, TanStack Start and Router, TanStack Query, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Supabase: PostgreSQL, row-level security, Realtime, Storage, RPC functions |
| Android | Capacitor 8, Gradle, a signed APK built by GitHub Actions |
| Delivery | Lovable (web hosting), GitHub Releases (APK), GitHub Pages (project page) |
| Process | AI-assisted development with Lovable and Claude |

## Android releases

[`.github/workflows/android-release.yml`](.github/workflows/android-release.yml) builds a signed release APK and publishes it as `NSS.apk` on a new GitHub Release. It runs on every change in `mobile/`, or manually from the Actions tab. The signing key is stored in repository secrets and is never committed.

To build locally, you need Node 22, JDK 21 and the Android SDK:

```bash
cd mobile
npm ci
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Run the web app locally

```bash
npm install
npm run dev
```

---

Built by **Yasen Kapitanov**, a Bachelor of AI in Business student at EU Business School, Barcelona.
