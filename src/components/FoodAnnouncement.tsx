import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { readFlag, setFlag } from "@/lib/food";

const KEY = "hl_food_announce_v1";

/** One-time "calorie tracker" announcement on the Training page. */
export function FoodAnnouncement() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { if (!readFlag(KEY)) setOpen(true); }, []);
  const done = () => { setFlag(KEY); setOpen(false); };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && done()}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Utensils className="h-8 w-8 text-primary" />
        <SheetTitle className="mt-3 font-display text-2xl font-extrabold uppercase">NEW: Calorie tracker</SheetTitle>
        <SheetDescription className="mt-2 text-base text-foreground">
          Take a photo of your meal and the AI estimates the calories and macros. Set your daily target in a minute.
        </SheetDescription>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" className="h-12" onClick={done}>Not now</Button>
          <Button className="h-12" onClick={() => { done(); navigate({ to: "/food" }); }}>Try it</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
