// ---------------------------------------------------------------------------
// Last Health Check result
// ---------------------------------------------------------------------------
// Smallest possible persistence: localStorage, same pattern used by
// onboarding (see app/components/onboarding/Onboarding.tsx). The Health
// Checker route should call `saveLastHealthCheckResult(...)` right after it
// finishes a scan — that file wasn't shared with me, so wire the call there.
//
// Storing the FILTER used (and how many orders were actually scanned) is the
// whole point here: a "100/100" score only means "no problems in the last
// 250 orders" or "no problems in the last 30 days" — not "my store is
// perfect forever". Without that context, a merchant who sees a clean score
// once has no reason to ever run it again, even as new orders keep coming in
// with new problems. The home page surfaces that filter + a re-check nudge
// next to the score so a green ring doesn't quietly become a false sense of
// security.

export interface HealthCheckFilter {
  /** Human-readable description of what was scanned, e.g. "Last 250 orders" or "Orders from the last 30 days". */
  label: string;
  /** How many orders were actually scanned in that run. */
  scannedCount: number;
}

export interface HealthCheckResult {
  score: number;
  issuesDetected: number;
  criticalIssues: number;
  filter: HealthCheckFilter;
  /** ISO timestamp of when the scan finished. */
  scannedAt: string;
}

const STORAGE_KEY = "orderRepair:lastHealthCheck";

export function saveLastHealthCheckResult(result: HealthCheckResult) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    /* ignore - non-critical */
  }
}

export function getLastHealthCheckResult(): HealthCheckResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HealthCheckResult;
  } catch {
    return null;
  }
}

/** How many days ago the last scan ran. Used to decide how urgent the re-check nudge should read. */
export function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}