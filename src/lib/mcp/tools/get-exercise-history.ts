import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_exercise_history",
  title: "Get exercise history",
  description: "Get the signed-in lifter's logged sets for one exercise by name, newest first (weights in kg).",
  inputSchema: {
    exercise: z.string().min(1).max(80).describe("Exercise name, e.g. 'Converging Flat Press'."),
    limit: z.number().int().min(1).max(200).optional().describe("Max sets to return (default 50)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ exercise, limit }, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) throw new ToolError("Not authenticated");
    const key = exercise.trim().toLowerCase();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("set_logs")
      .select("exercise_name, set_number, reps, weight_kg, completed, created_at")
      .eq("user_id", userId)
      .eq("exercise_key", key)
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (error) throw new ToolError(error.message);
    const sets = (data ?? []).map((l) => ({
      exercise: l.exercise_name, set: l.set_number, reps: l.reps, weight_kg: l.weight_kg, completed: l.completed, logged_at: l.created_at,
    }));
    return { content: [{ type: "text", text: sets.length ? JSON.stringify(sets) : `No sets logged for "${exercise}".` }], structuredContent: { sets } };
  },
});
