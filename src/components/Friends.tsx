import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchBoard } from "@/lib/board";
import { formatLast } from "@/lib/titan";

export function Friends({ exerciseKey, me }: { exerciseKey: string; me: string }) {
  const q = useQuery({ queryKey: ["board", exerciseKey], queryFn: () => fetchBoard(exerciseKey), staleTime: 60_000 });
  const others = (q.data ?? []).filter((e) => e.userId !== me);
  if (!others.length) return null;
  return (
    <div className="mt-3 rounded-2xl bg-card px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-widest text-muted-foreground">FRIENDS</span>
        <Link to="/progress/$key" params={{ key: exerciseKey }} search={{ tab: "leaderboard" }} className="py-1 text-xs font-semibold text-primary">
          See all
        </Link>
      </div>
      <ul className="mt-1 divide-y divide-border">
        {others.slice(0, 5).map((e) => (
          <li key={e.userId} className="flex items-center gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{e.name}</div>
              <div className="truncate text-xs text-muted-foreground">{formatLast(e.last)}</div>
            </div>
            <div className="font-bold">{e.max} kg</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
