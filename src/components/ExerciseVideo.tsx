import { ExternalLink, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { ExerciseMedia } from "@/lib/exercise-media";

export function ExerciseVideoTile({ media, name, onPlay }: {
  media: ExerciseMedia;
  name: string;
  onPlay: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onPlay}
      aria-label={`Watch ${name} demo`}
      title={`Watch ${name} demo`}
      className="relative h-auto min-h-24 w-28 shrink-0 overflow-hidden rounded-lg bg-card p-0 active:scale-[0.98] sm:w-36"
    >
      <img
        src={`https://i.ytimg.com/vi/${media.youtube_id}/hqdefault.jpg`}
        alt={`${name} video thumbnail`}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-background/85 text-foreground ring-1 ring-foreground/30 [&_svg]:size-5">
        <Play fill="currentColor" />
      </span>
    </Button>
  );
}

export function ExerciseVideoSheet({ media, onClose }: {
  media: ExerciseMedia | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={media !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="max-h-[90dvh] overflow-y-auto px-0 pt-5 pb-safe motion-reduce:animate-none motion-reduce:transition-none"
        onTouchStart={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
      >
        <SheetTitle className="mb-4 px-5 pr-12">{media?.title || media?.exercise_key || "Exercise demo"}</SheetTitle>
        {media && (
          <>
            <div className="mx-auto aspect-video w-full max-w-4xl bg-card">
              <iframe
                key={media.youtube_id}
                title={`${media.title || media.exercise_key} demo`}
                src={`https://www.youtube-nocookie.com/embed/${media.youtube_id}?playsinline=1&autoplay=1&rel=0&modestbranding=1`}
                className="h-full w-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            {(media.setup?.trim() || media.execution?.trim()) && (
              <div className="space-y-5 px-5 pt-5">
                {media.setup?.trim() && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-bold tracking-widest text-muted-foreground">SETUP</div>
                    <p className="text-base leading-relaxed whitespace-pre-line text-foreground">{media.setup}</p>
                  </div>
                )}
                {media.execution?.trim() && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-bold tracking-widest text-muted-foreground">EXECUTION</div>
                    <p className="text-base leading-relaxed whitespace-pre-line text-foreground">{media.execution}</p>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-center px-5 py-3">
              <Button asChild variant="link" className="min-h-11">
                <a href={`https://www.youtube.com/watch?v=${media.youtube_id}`} target="_blank" rel="noopener noreferrer">
                  Open in YouTube <ExternalLink />
                </a>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
/** YouTube search for an exercise's technique, for exercises without a curated demo video. */
export const techniqueSearchUrl = (name: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name.trim()} technique`)}`;

/** Takes the demo tile's place when an exercise has no video (e.g. imported programs). */
export function TechniqueSearchTile({ name }: { name: string }) {
  return (
    <a
      href={techniqueSearchUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch ${name} technique on YouTube`}
      className="flex min-h-24 w-28 shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-card px-2 text-center text-xs font-bold text-primary active:scale-[0.98] sm:w-36"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background ring-1 ring-primary/40">
        <Play className="h-4 w-4" />
      </span>
      Watch technique
      <span className="-mt-1 text-[10px] font-medium text-muted-foreground">YouTube search</span>
    </a>
  );
}
