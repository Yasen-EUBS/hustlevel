import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listRecentWorkouts from "./tools/list-recent-workouts";
import getExerciseHistory from "./tools/get-exercise-history";
import listMeals from "./tools/list-meals";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "hustlevel",
  title: "HustLevel",
  version: "0.1.0",
  instructions: "Read-only tools for the signed-in HustLevel lifter: recent workouts, per-exercise set history, and daily meal logs. Weights are in kg.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listRecentWorkouts, getExerciseHistory, listMeals],
});
