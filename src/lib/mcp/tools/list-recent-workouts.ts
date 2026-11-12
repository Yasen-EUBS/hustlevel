import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_recent_workouts",
  title: "List recent workouts",
  description: "List the signed-in lifter's most recent workout sessions with their logged sets (weights in kg).",
  inputSchema: { limit: z.number().int().min(1).max(20).optional().describe("How many sessions to return (default 5).") },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) throw new ToolError("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("id, session_date, day_title, completed_at, set_logs(exercise_name, set_number, reps, weight_kg, completed)")
      .eq("user_id", userId)
      .order("session_date", { ascending: false })
      .limit(limit ?? 5);
    if (error) throw new ToolError(error.message);
    const sessions = (data ?? []).map((s) => ({
      id: s.id,
      date: s.session_date,
      day: s.day_title,
      finished: s.completed_at !== null,
      sets: (s.set_logs ?? [])
        .sort((a, b) => a.exercise_name.localeCompare(b.exercise_name) || a.set_number - b.set_number)
        .map((l) => ({ exercise: l.exercise_name, set: l.set_number, reps: l.reps, weight_kg: l.weight_kg, completed: l.completed })),
    }));
    return { content: [{ type: "text", text: JSON.stringify(sessions) }], structuredContent: { sessions } };
  },
});
