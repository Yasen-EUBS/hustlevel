import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_meals",
  title: "List meals for a day",
  description: "List the signed-in user's logged meals and totals for one date (calories and macros in grams).",
  inputSchema: { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date as YYYY-MM-DD.") },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ date }, ctx) => {
    const userId = ctx.getUserId();
    if (!userId) throw new ToolError("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("meals")
      .select("name, calories, protein_g, carbs_g, fat_g, created_at")
      .eq("user_id", userId)
      .eq("eaten_on", date)
      .order("created_at");
    if (error) throw new ToolError(error.message);
    const meals = (data ?? []).map((m) => ({ name: m.name, calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g }));
    const totals = meals.reduce((t, m) => ({ calories: t.calories + m.calories, protein_g: t.protein_g + m.protein_g, carbs_g: t.carbs_g + m.carbs_g, fat_g: t.fat_g + m.fat_g }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    return { content: [{ type: "text", text: JSON.stringify({ meals, totals }) }], structuredContent: { meals, totals } };
  },
});
