import { Share, X } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "nss-a2hs-dismissed-at";
const DISMISS_DAYS = 14;

// iOS Safari only, and only when the app is not already running installed.
function isIosSafariStandaloneCandidate() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: unknown };
  if (w.Capacitor) return false;
  const ua = window.navigator.userAgent;
  if (/Android/i.test(ua)) return false;
  const standalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (standalone) return false;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  const isSafari = /AppleWebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|GSA|Opt/i.test(ua);
  return isIos && isSafari;
}

function wasRecentlyDismissed() {
  try {
    const at = Number(window.localStorage.getItem(STORAGE_KEY) ?? "0");
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function InstallPrompt({ variant }: { variant: "card" | "banner" }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIosSafariStandaloneCandidate()) return;
    if (wasRecentlyDismissed()) return;
    setShow(true);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {}
  }

  if (!show) return null;

  if (variant === "card") {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-card p-4 text-left">
        <Share className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
          Install HustLevel: tap Share, then Add to Home Screen.
        </p>
        <button onClick={dismiss} aria-label="Dismiss install hint" className="shrink-0 rounded-full p-1.5 active:bg-muted">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-full bg-card px-4 py-2.5 shadow-lg ring-1 ring-border">
      <Share className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">
        Install HustLevel: tap Share, then Add to Home Screen.
      </p>
      <button onClick={dismiss} aria-label="Dismiss install hint" className="shrink-0 rounded-full p-1 active:bg-muted">
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}
