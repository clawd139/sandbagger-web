// Shared constants and types for the Sandbagger web app

// Hardcoded user UUID (no auth in web app yet)
export const USER_ID = "c558af9c-3107-4f96-9d83-af0106e8b2be";

// Theme colors
export const PRIMARY = "#0a7d32";
export const PRIMARY_DARK = "#065f23";
export const GOLD = "#d4a843";
export const OFF_WHITE = "#f5f5f0";
export const CARD_BG = "#f8f8f4";

// Tee colors mapping
export const TEE_COLORS: Record<string, string> = {
  Black: "#000000",
  Blue: "#1e3a8a",
  White: "#ffffff",
  Gold: "#d4a843",
  Red: "#dc2626",
  Green: "#16a34a",
};

// Tee color for display — returns a hex string for a tee color or name
export function getTeeColor(colorOrName: string): string {
  return TEE_COLORS[colorOrName] || TEE_COLORS[colorOrName?.toLowerCase?.()] || "#888";
}

// Check if a tee is white (needs a border)
export function isWhiteTee(colorOrName: string): boolean {
  return colorOrName === "White" || colorOrName?.toLowerCase?.() === "white";
}

// ============ Types ============

export interface Course {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  num_holes: number;
  created_at?: string;
}

export interface Hole {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  distance_yards: number | null;
  shape?: string;
}

export interface TeeSet {
  id: string;
  course_id: string;
  color: string;
  name: string;
  total_yardage: number;
  total_par: number;
  rating: number;
  slope: number;
}

export interface TeeHole {
  id: string;
  tee_set_id: string;
  hole_number: number;
  yardage: number;
  par: number;
  handicap_index: number;
}

export interface Round {
  id: string;
  user_id: string;
  course_id: string;
  date_played: string;
  total_score: number;
  weather: string | null;
  wind: string | null;
  is_complete: boolean;
  visibility: string;
  tee_set_id: string | null;
  mixed_tees: boolean | null;
  notes: string | null;
  sb_courses?: Course | null;
}

export interface HoleScore {
  id: string;
  round_id: string;
  hole_number: number;
  par: number | null;
  score: number;
  putts: number | null;
  fairway_hit: boolean | null;
  fairway_miss_dir: string | null;
  gir: boolean | null;
  penalties: number | null;
  wedge_and_in: number | null;
  proximity: number | null;
  notes: string | null;
}

// ============ Helpers ============

// Parse round notes JSON safely
export function parseNotes(notes: string | null): Record<string, any> {
  if (!notes) return {};
  try {
    return JSON.parse(notes);
  } catch {
    return {};
  }
}

// Format a date string for display
export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// Format a short date
export function formatShortDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// Score relative to par label
export function scoreToParLabel(score: number, par: number): { label: string; color: string } {
  const diff = score - par;
  if (diff <= -2) return { label: `E${diff}`, color: "#7c3aed" }; // Eagle
  if (diff === -1) return { label: "Birdie", color: "#d4a843" }; // Birdie
  if (diff === 0) return { label: "Par", color: "#0a7d32" }; // Par
  if (diff === 1) return { label: "Bogey", color: "#f59e0b" }; // Bogey
  if (diff === 2) return { label: "Double", color: "#ef4444" }; // Double Bogey
  return { label: `+${diff}`, color: "#dc2626" }; // Triple+
}

// Score badge background color relative to par
export function scoreBadgeColor(score: number, par: number): string {
  const diff = score - par;
  if (diff <= -2) return "#7c3aed"; // Eagle — purple
  if (diff === -1) return "#d4a843"; // Birdie — gold
  if (diff === 0) return "#0a7d32"; // Par — green
  if (diff === 1) return "#f59e0b"; // Bogey — amber
  return "#dc2626"; // Double+ — red
}

// Calculate round stats from hole scores
export function calcRoundStats(holes: HoleScore[]) {
  const fwHoles = holes.filter((h) => h.fairway_hit !== null);
  const girHoles = holes.filter((h) => h.gir !== null);
  const puttHoles = holes.filter((h) => h.putts !== null);
  const fwPct = fwHoles.length ? Math.round((fwHoles.filter((h) => h.fairway_hit).length / fwHoles.length) * 100) : null;
  const girPct = girHoles.length ? Math.round((girHoles.filter((h) => h.gir).length / girHoles.length) * 100) : null;
  const totalPutts = puttHoles.reduce((s, h) => s + (h.putts || 0), 0);
  const avgPutts = puttHoles.length ? totalPutts / puttHoles.length : null;
  const onePutts = puttHoles.filter((h) => h.putts === 1).length;
  const threePutts = puttHoles.filter((h) => (h.putts || 0) >= 3).length;
  const birdies = holes.filter((h) => h.score && h.par && h.score < h.par).length;
  const eagles = holes.filter((h) => h.score && h.par && h.score <= h.par - 2).length;
  const bogeys = holes.filter((h) => h.score && h.par && h.score > h.par).length;
  return { fwPct, girPct, avgPutts, totalPutts, onePutts, threePutts, birdies, eagles, bogeys, fwHoles: fwHoles.length, girHoles: girHoles.length };
}

// Tournament detection: auto-cluster same-course rounds ≤4 days apart
export function detectTournaments(rounds: { id: string; course_id: string; date_played: string }[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const sorted = [...rounds].sort((a, b) => new Date(a.date_played).getTime() - new Date(b.date_played).getTime());

  for (let i = 0; i < sorted.length; i++) {
    if (result.get(sorted[i].id)) continue; // already clustered
    // Check forward for same-course rounds within 4 days
    let cluster: string[] = [sorted[i].id];
    const baseDate = new Date(sorted[i].date_played).getTime();
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].course_id !== sorted[i].course_id) continue;
      const diff = Math.abs(new Date(sorted[j].date_played).getTime() - baseDate);
      const dayDiff = diff / (1000 * 60 * 60 * 24);
      if (dayDiff <= 4) {
        cluster.push(sorted[j].id);
      }
    }
    // If 2+ rounds clustered, mark them as tournament
    if (cluster.length >= 2) {
      cluster.forEach((id) => result.set(id, true));
    }
  }
  return result;
}

// Sanitize shots array for safety (defensive coding)
export function sanitizeShots(shots: any[]): any[] {
  if (!Array.isArray(shots)) return [];
  return shots.filter((s) => s && typeof s === "object");
}
