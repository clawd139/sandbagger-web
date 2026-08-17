"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { USER_ID, parseNotes, formatDate, totalScoreColor } from "@/lib/constants";
import type { Round, Course, HoleScore } from "@/lib/constants";
import ScoreCell from "@/components/ScoreCell";

interface RoundWithCourse extends Round {
  sb_courses?: Course | null;
}

// ============ Theme ============
const PRIMARY = "#0a7d32";
const GOLD = "#d4a843";
const OFF_WHITE = "#f5f5f0";

// ============ Constants ============

const DISTANCE_BUCKETS = [
  { label: "0-20", min: 0, max: 20 },
  { label: "20-40", min: 20, max: 40 },
  { label: "40-60", min: 40, max: 60 },
  { label: "60-80", min: 60, max: 80 },
  { label: "80-100", min: 80, max: 100 },
  { label: "100-120", min: 100, max: 120 },
  { label: "120-140", min: 120, max: 140 },
  { label: "140-160", min: 140, max: 160 },
  { label: "160-180", min: 160, max: 180 },
  { label: "180-200", min: 180, max: 200 },
  { label: "200-220", min: 200, max: 220 },
  { label: "220+", min: 220, max: Infinity },
];

const PUTT_DISTANCE_BUCKETS = [
  { label: "0-6ft", min: 0, max: 6 },
  { label: "7-20ft", min: 7, max: 20 },
  { label: "20-30ft", min: 20, max: 30 },
  { label: "30-40ft", min: 30, max: 40 },
  { label: "40+ft", min: 40, max: Infinity },
];

const APPROACH_MISS_DIRS = [
  { key: "On Target", color: "#0a7d32" },
  { key: "Short", color: "#f59e0b" },
  { key: "Long", color: "#dc2626" },
  { key: "Left", color: "#3b82f6" },
  { key: "Right", color: "#ef4444" },
  { key: "Short-Left", color: "#8b5cf6" },
  { key: "Short-Right", color: "#ec4899" },
  { key: "Long-Left", color: "#6366f1" },
  { key: "Long-Right", color: "#f97316" },
];

const PUTT_MISS_DIRS = [
  { key: "made", color: "#0a7d32" },
  { key: "miss-short", color: "#f59e0b" },
  { key: "miss-long", color: "#dc2626" },
  { key: "miss-left", color: "#3b82f6" },
  { key: "miss-right", color: "#ef4444" },
  { key: "lip-out-left", color: "#8b5cf6" },
  { key: "lip-out-right", color: "#ec4899" },
];

// 8 compass directions mapped to degrees (0 = North/up)
const PUTT_RESULT_ANGLE: Record<string, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

// Map normalized putt result → compass direction
const PUTT_RESULT_TO_COMPASS: Record<string, string> = {
  "miss-long": "N",
  "miss-short": "S",
  "miss-left": "W",
  "miss-right": "E",
  "lip-out-left": "NW",
  "lip-out-right": "NE",
};

const SLOPE_COLOR: Record<string, string> = {
  Uphill: "#0a7d32",
  Downhill: "#dc2626",
  Sidehill: "#3b82f6",
  Flat: "#6b7280",
};

const RANGE_OPTIONS = ["All", "Last 3", "Last 5", "Last 10", "Last 25"] as const;
type RangeOption = (typeof RANGE_OPTIONS)[number];

// ============ Helper functions ============

function safeStr(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function safeNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// Categorize precise pin data into one of 9 quadrants
// Rules: center offset > +5 = back, < -5 = front, between = mid
//        side distance < 10 from edge = that side, >= 10 = center
function categorizePin(shot: any): string {
  if (shot.pin_mode === "general" && shot.pin_quadrant) return shot.pin_quadrant;

  const center = safeNum(shot.pin_center_offset);
  const side = safeNum(shot.pin_side_dist);

  if (center === null && side === null) return "";

  let fb = "mid";
  if (center !== null) {
    if (center > 5) fb = "back";
    else if (center < -5) fb = "front";
  }

  let lr = "center";
  if (side !== null && side < 10) {
    lr = shot.pin_side_dir === "L" ? "left" : shot.pin_side_dir === "R" ? "right" : "center";
  }

  if (fb === "mid" && lr === "center") return "center";
  return `${fb}-${lr}`;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function computeStats(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const iqr = q3 - q1;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return { n, min, q1, median, q3, max, mean, iqr, stddev };
}

function isPutt(shot: any, startingLie?: string): boolean {
  // A shot is only a putt if it started on the green or fringe.
  // A chip with a putter from off the green does NOT count.
  const lie = safeStr(startingLie);
  if (lie !== "Green" && lie !== "Fringe") return false;
  if (shot?.is_putt === true) return true;
  return shot?.putt_result != null;
}

function passes(shot: any, field: string, filterValue: string): boolean {
  if (!filterValue || filterValue === "All") return true;
  return safeStr(shot[field]) === filterValue;
}

function normalizeMiss(dir: any): string {
  const d = safeStr(dir).toLowerCase().trim();
  if (!d) return "On Target";
  const map: Record<string, string> = {
    l: "Left",
    left: "Left",
    r: "Right",
    right: "Right",
    s: "Short",
    short: "Short",
    long: "Long",
    sl: "Short-Left",
    "short-left": "Short-Left",
    shortleft: "Short-Left",
    sr: "Short-Right",
    "short-right": "Short-Right",
    shortright: "Short-Right",
    ll: "Long-Left",
    "long-left": "Long-Left",
    longleft: "Long-Left",
    lr: "Long-Right",
    "long-right": "Long-Right",
    longright: "Long-Right",
    ontarget: "On Target",
    "on target": "On Target",
    hit: "On Target",
    center: "On Target",
    c: "On Target",
  };
  return map[d] || "On Target";
}

function normalizePuttResult(r: any): string {
  const s = safeStr(r).toLowerCase().trim();
  if (!s) return "miss-short";
  if (s.includes("made") || s === "make" || s === "in") return "made";
  if (s.includes("lip-out-left") || s.includes("lipoutleft") || s.includes("lipped-left"))
    return "lip-out-left";
  if (s.includes("lip-out-right") || s.includes("lipoutright") || s.includes("lipped-right"))
    return "lip-out-right";
  if (s.includes("short")) return "miss-short";
  if (s.includes("long")) return "miss-long";
  if (s.includes("left")) return "miss-left";
  if (s.includes("right")) return "miss-right";
  return "miss-short";
}

function buildHittingFromMap(allShots: any[]): Map<string, string> {
  const m = new Map<string, string>();
  // Track previous shot's global index per hole
  const lastByHole = new Map<number, number>();
  allShots.forEach((s, i) => {
    const h = Number(s.hole_number);
    if (lastByHole.has(h)) {
      const prevIdx = lastByHole.get(h)!;
      m.set(`${h}-${i}`, safeStr(allShots[prevIdx].result_lie));
    }
    lastByHole.set(h, i);
  });
  return m;
}

function buildProximityMap(
  allShots: any[],
  hittingFromMap: Map<string, string>
): Map<string, number> {
  const m = new Map<string, number>();
  allShots.forEach((s, i) => {
    const key = `${s.hole_number}-${i}`;
    let prox: number | null = null;
    const startingLie = hittingFromMap.get(key) || "";
    if (isPutt(s, startingLie)) {
      prox = normalizePuttResult(s.putt_result) === "made" ? 0 : safeNum(s.putt_distance_remaining);
    } else if (safeStr(s.intention) === "hit_green") {
      const onGreen = safeStr(s.result_lie) === "Green";
      const dToHole = safeNum(s.distance_to_hole);
      if (onGreen) {
        if (dToHole != null) prox = dToHole * 3; // yards → feet
      } else {
        if (dToHole != null) prox = dToHole * 3;
      }
    }
    if (prox != null) m.set(key, prox);
  });
  return m;
}

function bucketFor(value: number | null, buckets: { min: number; max: number; label: string }[]): string {
  if (value == null) return "—";
  for (const b of buckets) {
    if (value >= b.min && value < b.max) return b.label;
  }
  if (value >= buckets[buckets.length - 1].min) return buckets[buckets.length - 1].label;
  return "—";
}

// ============ Page Component ============

export default function StatsPage() {
  const { user, loading: authLoading } = useAuth();
  const activeUserId = user?.id || USER_ID;

  const [rounds, setRounds] = useState<RoundWithCourse[]>([]);
  const [allScores, setAllScores] = useState<HoleScore[]>([]);
  const [clubShots, setClubShots] = useState<{ club: string; distance_yards: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const [range, setRange] = useState<RangeOption>("All");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advTab, setAdvTab] = useState<"tee" | "approach" | "putting">("tee");
  const [expandedRound, setExpandedRound] = useState<string | null>(null);

  // Filters
  const [appClub, setAppClub] = useState("All");
  const [appDist, setAppDist] = useState("All");
  const [appFrom, setAppFrom] = useState("All");
  const [puttDist, setPuttDist] = useState("All");
  const [puttFrom, setPuttFrom] = useState("All");
  const [puttSlope, setPuttSlope] = useState("All");
  const [puttBreak, setPuttBreak] = useState("All");

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    (async () => {
      const { data: roundsData } = await supabase
        .from("sb_rounds")
        .select("id, date_played, total_score, notes, weather, wind, sb_courses(name)")
        .eq("user_id", activeUserId)
        .eq("is_complete", true)
        .order("date_played", { ascending: true });

      const rds = (roundsData || []) as unknown as RoundWithCourse[];
      setRounds(rds);

      if (rds.length > 0) {
        const { data: scores } = await supabase
          .from("sb_hole_scores")
          .select(
            "round_id, fairway_hit, fairway_miss_dir, gir, putts, wedge_and_in, hole_number, score, par, notes"
          )
          .in("round_id", rds.map((r) => r.id))
          .order("hole_number");
        setAllScores((scores || []) as unknown as HoleScore[]);
      } else {
        setAllScores([]);
      }

      // Club distances — table may not exist
      try {
        const { data: shotData, error } = await supabase
          .from("sb_shots")
          .select("club, distance_yards, hole_score_id")
          .not("club", "is", null)
          .not("distance_yards", "is", null);
        if (!error && shotData) {
          setClubShots(
            (shotData as any[])
              .filter((s) => s.club && s.distance_yards != null)
              .map((s) => ({ club: String(s.club), distance_yards: Number(s.distance_yards) }))
          );
        }
      } catch {
        setClubShots([]);
      }

      setLoading(false);
    })();
  }, [activeUserId, authLoading]);

  // ===== Derived data =====

  const rangeN = range === "All" ? 0 : parseInt(range.split(" ")[1], 10);
  const filteredRounds = useMemo(
    () => (rangeN > 0 ? rounds.slice(-rangeN) : rounds),
    [rounds, rangeN]
  );
  const filteredRoundIds = useMemo(
    () => new Set(filteredRounds.map((r) => r.id)),
    [filteredRounds]
  );
  const filteredScores = useMemo(
    () => allScores.filter((s) => filteredRoundIds.has(s.round_id)),
    [allScores, filteredRoundIds]
  );

  // Summary stats
  const scoresList = filteredRounds.map((r) => r.total_score).filter((s) => s > 0);
  const avgScore = scoresList.length
    ? Math.round((scoresList.reduce((a, b) => a + b, 0) / scoresList.length) * 10) / 10
    : 0;

  const fwHoles = filteredScores.filter((h) => h.fairway_hit !== null);
  const fwHit = fwHoles.filter((h) => h.fairway_hit === true).length;
  const fwPct = fwHoles.length ? Math.round((fwHit / fwHoles.length) * 100) : 0;

  const girHoles = filteredScores.filter((h) => h.gir !== null);
  const girHit = girHoles.filter((h) => h.gir === true).length;
  const girPct = girHoles.length ? Math.round((girHit / girHoles.length) * 100) : 0;

  const puttHoles = filteredScores.filter((h) => h.putts !== null && h.putts > 0);
  const totalPutts = puttHoles.reduce((s, h) => s + (h.putts || 0), 0);
  // Only count rounds that have actual hole score data (excludes skip-stats rounds)
  const roundsWithScores = new Set(filteredScores.map((s) => s.round_id)).size;
  const puttsPerRnd = roundsWithScores ? totalPutts / roundsWithScores : 0;
  const onePutts = puttHoles.filter((h) => h.putts === 1).length;
  const threePutts = puttHoles.filter((h) => (h.putts || 0) >= 3).length;
  const onePuttsPerRnd = roundsWithScores ? onePutts / roundsWithScores : 0;
  const threePuttsPerRnd = roundsWithScores ? threePutts / roundsWithScores : 0;

  // Fairway miss tendency
  const fwMissL = fwHoles.filter((h) => h.fairway_hit === false && h.fairway_miss_dir === "L").length;
  const fwMissR = fwHoles.filter((h) => h.fairway_hit === false && h.fairway_miss_dir === "R").length;
  const fwMissTotal = fwMissL + fwMissR;

  // Advanced shots from notes
  const allShots = useMemo(() => {
    const out: any[] = [];
    filteredScores.forEach((hs) => {
      const n = parseNotes(hs.notes);
      if (n.mode === "advanced" && Array.isArray(n.shots)) {
        n.shots.forEach((s: any) => {
          if (s && typeof s === "object") {
            out.push({ ...s, hole_number: hs.hole_number, par: hs.par, pinQuadrant: categorizePin(s) });
          }
        });
      }
    });
    return out;
  }, [filteredScores]);

  const hittingFromMap = useMemo(() => buildHittingFromMap(allShots), [allShots]);
  const proximityMap = useMemo(
    () => buildProximityMap(allShots, hittingFromMap),
    [allShots, hittingFromMap]
  );

  // Wedge & In
  const wiHoles = filteredScores.filter((s) => s.wedge_and_in != null);
  const wiTotal = wiHoles.reduce((s, h) => s + (h.wedge_and_in || 0), 0);
  const wiAvg = wiHoles.length ? wiTotal / wiHoles.length : null;

  // Club distances aggregated
  const clubAgg = useMemo(() => {
    const m = new Map<string, number[]>();
    clubShots.forEach((s) => {
      if (!m.has(s.club)) m.set(s.club, []);
      m.get(s.club)!.push(s.distance_yards);
    });
    const arr: { club: string; avg: number; count: number }[] = [];
    m.forEach((vals, club) => {
      arr.push({
        club,
        avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        count: vals.length,
      });
    });
    return arr.sort((a, b) => b.avg - a.avg);
  }, [clubShots]);

  // ===== Loading / Empty =====
  if (loading) {
    return (
      <div className="px-4 pt-10 text-center text-gray-400 text-sm">Loading stats...</div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="px-4 pt-20 text-center">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-lg font-bold text-green-800">No stats yet</p>
        <p className="text-sm text-gray-400 mt-1">Log some rounds to see your stats!</p>
        <Link
          href="/rounds/new"
          className="mt-4 inline-block text-sm px-4 py-2 rounded-full bg-green-700 text-white font-semibold"
        >
          Log a Round
        </Link>
      </div>
    );
  }

  // ===== Shot filtering for advanced tabs =====
  const teeShots = allShots.filter(
    (s, i) =>
      safeStr(s.intention) === "hit_fairway" &&
      !isPutt(s, hittingFromMap.get(`${s.hole_number}-${i}`) || "")
  );
  const approachShots = allShots.filter(
    (s, i) =>
      safeStr(s.intention) === "hit_green" &&
      !isPutt(s, hittingFromMap.get(`${s.hole_number}-${i}`) || "")
  );
  const puttShots = allShots.filter(
    (s, i) => isPutt(s, hittingFromMap.get(`${s.hole_number}-${i}`) || "")
  );

  return (
    <div className="px-4 pt-4 pb-4">
      <h1 className="text-2xl font-bold text-green-800 mb-3">Stats</h1>

      {/* Range filter pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => setRange(opt)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              range === opt
                ? "bg-green-700 text-white"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* ===== Summary Stats ===== */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <SummaryCard label="Avg Score" value={avgScore ? String(avgScore) : "—"} />
        <SummaryCard label="Fairways" value={fwHoles.length ? `${fwPct}%` : "—"} />
        <SummaryCard label="GIR" value={girHoles.length ? `${girPct}%` : "—"} />
        <SummaryCard label="Putts/Rnd" value={filteredRounds.length ? puttsPerRnd.toFixed(1) : "—"} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <SummaryCard
          label="1-Putts / Rnd"
          value={filteredRounds.length ? onePuttsPerRnd.toFixed(1) : "—"}
          wide
        />
        <SummaryCard
          label="3-Putts / Rnd"
          value={filteredRounds.length ? threePuttsPerRnd.toFixed(1) : "—"}
          wide
        />
      </div>

      {/* ===== Fairway Miss Tendency ===== */}
      {fwMissTotal > 0 && (
        <Section title="Fairway Miss Tendency">
          <div className="mb-2">
            <div className="flex h-7 rounded-full overflow-hidden bg-gray-100">
              <div
                className="flex items-center justify-center text-[10px] text-white font-bold"
                style={{
                  width: `${(fwMissL / fwMissTotal) * 100}%`,
                  backgroundColor: "#f59e0b",
                  minWidth: fwMissL > 0 ? "32px" : "0",
                }}
              >
                {fwMissL > 0 && `L ${Math.round((fwMissL / fwMissTotal) * 100)}%`}
              </div>
              <div
                className="flex items-center justify-center text-[10px] text-white font-bold"
                style={{
                  width: `${(fwMissR / fwMissTotal) * 100}%`,
                  backgroundColor: "#ef4444",
                  minWidth: fwMissR > 0 ? "32px" : "0",
                }}
              >
                {fwMissR > 0 && `R ${Math.round((fwMissR / fwMissTotal) * 100)}%`}
              </div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mr-1 align-middle" />
              Left {fwMissL}
            </span>
            <span>
              Right {fwMissR}
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 ml-1 align-middle" />
            </span>
          </div>
        </Section>
      )}

      {/* ===== Advanced Stats Dashboard ===== */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className="w-full flex items-center justify-between"
        >
          <h2 className="text-sm font-bold text-gray-700">
            Advanced Stats {allShots.length > 0 && `(${allShots.length} shots)`}
          </h2>
          <span className="text-xs text-gray-400">{advancedOpen ? "▲" : "▼"}</span>
        </button>

        {advancedOpen && (
          <div className="mt-3">
            {allShots.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                No advanced shot data tracked yet.
              </p>
            ) : (
              <>
                {/* Tab pills */}
                <div className="flex gap-2 mb-3">
                  {(["tee", "approach", "putting"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAdvTab(t)}
                      className={`flex-1 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
                        advTab === t
                          ? "bg-green-700 text-white"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {advTab === "tee" && (
                  <TeeTab
                    shots={teeShots}
                  />
                )}
                {advTab === "approach" && (
                  <ApproachTab
                    shots={approachShots}
                    allShots={allShots}
                    proximityMap={proximityMap}
                    hittingFromMap={hittingFromMap}
                    club={appClub}
                    setClub={setAppClub}
                    dist={appDist}
                    setDist={setAppDist}
                    from={appFrom}
                    setFrom={setAppFrom}
                  />
                )}
                {advTab === "putting" && (
                  <PuttingTab
                    shots={puttShots}
                    allShots={allShots}
                    hittingFromMap={hittingFromMap}
                    dist={puttDist}
                    setDist={setPuttDist}
                    from={puttFrom}
                    setFrom={setPuttFrom}
                    slope={puttSlope}
                    setSlope={setPuttSlope}
                    brk={puttBreak}
                    setBrk={setPuttBreak}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ===== Scoring Trend ===== */}
      {filteredRounds.length > 0 && (
        <Section title="Scoring Trend (Last 10)">
          <ScoringTrend rounds={filteredRounds.slice(-10)} />
        </Section>
      )}

      {/* ===== Recent Rounds ===== */}
      <Section title="Recent Rounds">
        <div className="space-y-2">
          {filteredRounds.slice(-10).reverse().map((round) => {
            const notes = parseNotes(round.notes);
            const isTournament = notes.round_type === "tournament";
            const rScores = filteredScores
              .filter((s) => s.round_id === round.id)
              .sort((a, b) => a.hole_number - b.hole_number);
            const isExpanded = expandedRound === round.id;

            const rFw = rScores.filter((h) => h.fairway_hit !== null);
            const rFwPct = rFw.length
              ? Math.round((rFw.filter((h) => h.fairway_hit).length / rFw.length) * 100)
              : null;
            const rGir = rScores.filter((h) => h.gir !== null);
            const rGirPct = rGir.length
              ? Math.round((rGir.filter((h) => h.gir).length / rGir.length) * 100)
              : null;
            const rPutts = rScores.reduce((s, h) => s + (h.putts || 0), 0);
            const rBirdies = rScores.filter((h) => h.score && h.par && h.score < h.par).length;
            const rBogeys = rScores.filter((h) => h.score && h.par && h.score > h.par).length;
            const rWi = rScores.filter((h) => h.wedge_and_in != null).length;
            const rPar = rScores.reduce((s, h) => s + (h.par || 0), 0);

            return (
              <div
                key={round.id}
                className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedRound(isExpanded ? null : round.id)}
                  className="w-full text-left p-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {round.sb_courses?.name || "Unknown Course"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDate(round.date_played)}
                        {isTournament && " 🏆"}
                      </p>
                    </div>
                    <span
                      className="text-2xl font-bold ml-2"
                      style={{ color: totalScoreColor(round.total_score, rPar) }}
                    >
                      {round.total_score}
                    </span>
                  </div>

                  {/* Mini scorecard */}
                  {rScores.length > 0 && (
                    <div className="flex gap-1 overflow-x-auto pb-1 mt-2">
                      {rScores.map((hole, idx) => (
                        <div key={idx} className="flex flex-col items-center min-w-[26px]">
                          <span className="text-[8px] text-gray-400">{hole.hole_number}</span>
                          <ScoreCell
                            score={hole.score}
                            par={hole.par || 0}
                            size={11}
                            mini
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </button>

                {isExpanded && rScores.length > 0 && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-200">
                    {/* Detail pills */}
                    <div className="flex flex-wrap gap-1.5 my-2">
                      {rFwPct != null && (
                        <Pill label="FW" value={`${rFwPct}%`} />
                      )}
                      {rGirPct != null && <Pill label="GIR" value={`${rGirPct}%`} />}
                      {rPutts > 0 && <Pill label="Putts" value={String(rPutts)} />}
                      {rBirdies > 0 && <Pill label="🐦" value={String(rBirdies)} />}
                      {rBogeys > 0 && <Pill label="Bogey" value={String(rBogeys)} />}
                      {rWi > 0 && <Pill label="W&I" value={String(rWi)} />}
                    </div>

                    {/* Full table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-green-700 text-white">
                            <th className="px-1.5 py-1 text-left font-semibold rounded-l">Hole</th>
                            <th className="px-1.5 py-1 text-center font-semibold">Par</th>
                            <th className="px-1.5 py-1 text-center font-semibold">Score</th>
                            <th className="px-1.5 py-1 text-center font-semibold">Putts</th>
                            <th className="px-1.5 py-1 text-center font-semibold">FW</th>
                            <th className="px-1.5 py-1 text-center font-semibold">GIR</th>
                            <th className="px-1.5 py-1 text-center font-semibold rounded-r">W&I</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rScores.map((hole, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                              <td className="px-1.5 py-1 font-bold text-green-700">
                                {hole.hole_number}
                              </td>
                              <td className="px-1.5 py-1 text-center">{hole.par ?? "—"}</td>
                              <td className="px-1.5 py-1 text-center">
                                <ScoreCell score={hole.score} par={hole.par || 0} size={11} mini />
                              </td>
                              <td className="px-1.5 py-1 text-center">{hole.putts ?? "—"}</td>
                              <td className="px-1.5 py-1 text-center">
                                {hole.fairway_hit === null
                                  ? "—"
                                  : hole.fairway_hit
                                  ? "✓"
                                  : hole.fairway_miss_dir || "✗"}
                              </td>
                              <td className="px-1.5 py-1 text-center">
                                {hole.gir ? "✓" : hole.gir === false ? "✗" : "—"}
                              </td>
                              <td className="px-1.5 py-1 text-center">
                                {hole.wedge_and_in != null ? hole.wedge_and_in : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ===== Wedge & In ===== */}
      {wiHoles.length > 0 && (
        <Section title="Wedge & In">
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Total Shots" value={String(wiTotal)} />
            <MiniStat label="Avg / Hole" value={wiAvg != null ? wiAvg.toFixed(1) : "—"} />
            <MiniStat label="Holes Tracked" value={String(wiHoles.length)} />
          </div>
        </Section>
      )}

      {/* ===== Club Distances ===== */}
      {clubAgg.length > 0 && (
        <Section title="Club Distances">
          <div className="space-y-2">
            {clubAgg.map((c) => (
              <div key={c.club} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-700 w-20 truncate">
                  {c.club}
                </span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center justify-end pr-2"
                    style={{
                      width: `${(c.avg / 300) * 100}%`,
                      backgroundColor: PRIMARY,
                      minWidth: c.avg > 0 ? "40px" : "0",
                    }}
                  >
                    <span className="text-[10px] text-white font-bold">{c.avg} yds</span>
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 w-10 text-right">{c.count} shots</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ============ Sub-components ============

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
      <h2 className="text-sm font-bold text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-2.5 text-center"
      style={{ backgroundColor: PRIMARY }}
    >
      <p className={`font-bold text-amber-400 leading-tight ${wide ? "text-xl py-1" : "text-xl"}`}>{value}</p>
      <p className="text-[9px] text-white opacity-80 leading-tight mt-0.5">{label}</p>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-gray-200 rounded-full px-2 py-0.5 text-gray-700">
      <span className="font-semibold">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <p className="text-lg font-bold text-green-700">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

function ScoringTrend({ rounds }: { rounds: RoundWithCourse[] }) {
  const scores = rounds.map((r) => r.total_score).filter((s) => s > 0);
  if (scores.length === 0) return <p className="text-xs text-gray-400">No scores.</p>;
  const maxS = Math.max(...scores);
  const minS = Math.min(...scores);
  const top = maxS + 2;
  return (
    <div className="flex items-end justify-between gap-1 h-28">
      {rounds.map((r, i) => {
        const s = r.total_score;
        if (!s) return <div key={i} className="flex-1" />;
        const heightPct = ((top - s) / (top - minS + 2)) * 100;
        const isBest = s === minS;
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-[9px] text-gray-500 mb-0.5">{s}</span>
            <div
              className="w-full rounded-t min-h-[3px]"
              style={{
                height: `${Math.max(heightPct, 6)}%`,
                backgroundColor: isBest ? GOLD : PRIMARY,
              }}
            />
            <span className="text-[8px] text-gray-400 mt-1 leading-tight text-center truncate w-full">
              {formatDate(r.date_played).split(",")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Horizontal stacked miss bar
function MissTendencyBar({
  shots,
  missField = "miss_dir",
}: {
  shots: any[];
  missField?: string;
}) {
  const counts: Record<string, number> = {};
  APPROACH_MISS_DIRS.forEach((d) => (counts[d.key] = 0));
  shots.forEach((s) => {
    const d = normalizeMiss(s[missField] ?? s.miss_dir);
    counts[d] = (counts[d] || 0) + 1;
  });
  const total = shots.length || 1;

  return (
    <div>
      <div className="flex h-6 rounded-full overflow-hidden bg-gray-100">
        {APPROACH_MISS_DIRS.map((d) => {
          const c = counts[d.key] || 0;
          if (c === 0) return null;
          return (
            <div
              key={d.key}
              className="flex items-center justify-center text-[8px] text-white font-bold"
              style={{
                width: `${(c / total) * 100}%`,
                backgroundColor: d.color,
                minWidth: c > 0 ? "14px" : "0",
              }}
              title={`${d.key}: ${c}`}
            >
              {c > 2 ? c : ""}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {APPROACH_MISS_DIRS.map((d) => {
          const c = counts[d.key] || 0;
          if (c === 0) return null;
          return (
            <span key={d.key} className="flex items-center text-[10px] text-gray-600">
              <span
                className="inline-block w-2 h-2 rounded-sm mr-1"
                style={{ backgroundColor: d.color }}
              />
              {d.key} {c}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function WhereEndedUp({ shots }: { shots: any[] }) {
  const counts: Record<string, number> = {};
  shots.forEach((s) => {
    const lie = safeStr(s.result_lie) || "Unknown";
    counts[lie] = (counts[lie] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map((e) => e[1]), 1);
  if (entries.length === 0)
    return <p className="text-xs text-gray-400">No data.</p>;
  return (
    <div className="space-y-1">
      {entries.map(([lie, c]) => (
        <div key={lie} className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600 w-20 truncate">{lie}</span>
          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(c / max) * 100}%`, backgroundColor: PRIMARY, minWidth: "20px" }}
            />
          </div>
          <span className="text-[10px] font-semibold text-gray-700 w-6 text-right">{c}</span>
        </div>
      ))}
    </div>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors ${
            value === opt
              ? "bg-green-700 text-white"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold text-gray-600 mt-3 mb-1.5">{children}</h3>;
}

// ============ Tee Tab ============
function TeeTab({
  shots,
}: {
  shots: any[];
}) {
  const filtered = shots;

  if (shots.length === 0)
    return <p className="text-xs text-gray-400 text-center py-4">No tee shot data.</p>;

  return (
    <div>
      <p className="text-[10px] text-gray-400 mb-1">{filtered.length} tee shots</p>

      <SubHeading>Miss Tendency</SubHeading>
      <MissTendencyBar shots={filtered} />

      <SubHeading>Where You Ended Up</SubHeading>
      <WhereEndedUp shots={filtered} />
    </div>
  );
}

// ============ Approach Tab ============
function ApproachTab({
  shots,
  allShots,
  proximityMap,
  hittingFromMap,
  club,
  setClub,
  dist,
  setDist,
  from,
  setFrom,
}: {
  shots: any[];
  allShots: any[];
  proximityMap: Map<string, number>;
  hittingFromMap: Map<string, string>;
  club: string;
  setClub: (v: string) => void;
  dist: string;
  setDist: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
}) {
  const clubs = useMemo(() => {
    const s = new Set<string>();
    shots.forEach((sh) => {
      const v = safeStr(sh.club);
      if (v) s.add(v);
    });
    return ["All", ...Array.from(s).sort()];
  }, [shots]);

  const froms = useMemo(() => {
    const s = new Set<string>();
    shots.forEach((sh) => {
      const key = `${sh.hole_number}-${allShots.indexOf(sh)}`;
      const v = hittingFromMap.get(key);
      if (v) s.add(v);
    });
    return ["All", ...Array.from(s).sort()];
  }, [shots, hittingFromMap, allShots]);

  const filtered = shots.filter((s) => {
    if (!passes(s, "club", club)) return false;
    // distance bucket of shot length
    const sl = safeNum(s.shot_length) ?? safeNum(s.distance_yards) ?? safeNum(s.yardage);
    if (dist !== "All" && bucketFor(sl, DISTANCE_BUCKETS) !== dist) return false;
    const key = `${s.hole_number}-${allShots.indexOf(s)}`;
    if (from !== "All" && (hittingFromMap.get(key) || "Unknown") !== from) return false;
    return true;
  });

  // Proximity values for filtered approach shots
  const proxValues = filtered
    .map((s) => {
      // find index in allShots to key proximity map
      const key = `${s.hole_number}-${allShots.indexOf(s)}`;
      return proximityMap.get(key);
    })
    .filter((v): v is number => v != null);

  const proxStats = computeStats(proxValues);

  if (shots.length === 0)
    return <p className="text-xs text-gray-400 text-center py-4">No approach shot data.</p>;

  // Histogram buckets 0-80ft in 10ft steps + 80+
  const histBuckets = [
    { label: "0-10", min: 0, max: 10 },
    { label: "10-20", min: 10, max: 20 },
    { label: "20-30", min: 20, max: 30 },
    { label: "30-40", min: 30, max: 40 },
    { label: "40-50", min: 40, max: 50 },
    { label: "50-60", min: 50, max: 60 },
    { label: "60-70", min: 60, max: 70 },
    { label: "70-80", min: 70, max: 80 },
    { label: "80+", min: 80, max: Infinity },
  ];
  const histCounts = histBuckets.map((b) => proxValues.filter((v) => v >= b.min && v < b.max).length);
  const histMax = Math.max(...histCounts, 1);

  return (
    <div>
      <SubHeading>Club</SubHeading>
      <ChipRow options={clubs} value={club} onChange={setClub} />
      <SubHeading>Distance</SubHeading>
      <ChipRow options={["All", ...DISTANCE_BUCKETS.map((b) => b.label)]} value={dist} onChange={setDist} />
      <SubHeading>Hitting From</SubHeading>
      <ChipRow options={froms} value={from} onChange={setFrom} />

      <p className="text-[10px] text-gray-400 mt-2 mb-1">{filtered.length} approach shots</p>

      {/* Proximity stats */}
      {proxStats ? (
        <div>
          <SubHeading>Proximity to Hole (feet)</SubHeading>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <ProxStat label="Count" value={String(proxStats.n)} />
            <ProxStat label="Mean" value={proxStats.mean.toFixed(1)} />
            <ProxStat label="Std Dev" value={proxStats.stddev.toFixed(1)} />
            <ProxStat label="Min" value={proxStats.min.toFixed(0)} />
            <ProxStat label="Q1" value={proxStats.q1.toFixed(1)} />
            <ProxStat label="Median" value={proxStats.median.toFixed(1)} />
            <ProxStat label="Q3" value={proxStats.q3.toFixed(1)} />
            <ProxStat label="Max" value={proxStats.max.toFixed(0)} />
            <ProxStat label="IQR" value={proxStats.iqr.toFixed(1)} />
          </div>

          {/* Histogram */}
          <SubHeading>Proximity Histogram</SubHeading>
          <div className="flex items-end justify-between gap-1 h-20">
            {histBuckets.map((b, i) => {
              const c = histCounts[i];
              return (
                <div key={b.label} className="flex-1 flex flex-col items-center">
                  <span className="text-[8px] text-gray-400">{c > 0 ? c : ""}</span>
                  <div
                    className="w-full rounded-t bg-green-600 min-h-[2px]"
                    style={{ height: `${(c / histMax) * 100}%`, minHeight: c > 0 ? "4px" : "0" }}
                  />
                  <span className="text-[7px] text-gray-400 mt-0.5">{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mt-2">No proximity data for these shots.</p>
      )}

      <SubHeading>Miss Tendency</SubHeading>
      <MissTendencyBar shots={filtered} />

      <SubHeading>Where You Ended Up</SubHeading>
      <WhereEndedUp shots={filtered} />
    </div>
  );
}

function ProxStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded px-1 py-1">
      <p className="text-sm font-bold text-green-700">{value}</p>
      <p className="text-[8px] text-gray-400">{label}</p>
    </div>
  );
}

// ============ Putting Tab ============
function PuttingTab({
  shots,
  allShots,
  hittingFromMap,
  dist,
  setDist,
  from,
  setFrom,
  slope,
  setSlope,
  brk,
  setBrk,
}: {
  shots: any[];
  allShots: any[];
  hittingFromMap: Map<string, string>;
  dist: string;
  setDist: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
  slope: string;
  setSlope: (v: string) => void;
  brk: string;
  setBrk: (v: string) => void;
}) {
  const froms = useMemo(() => {
    const s = new Set<string>();
    shots.forEach((sh) => {
      const key = `${sh.hole_number}-${allShots.indexOf(sh)}`;
      const v = hittingFromMap.get(key);
      if (v) s.add(v);
    });
    return ["All", ...Array.from(s).sort()];
  }, [shots, hittingFromMap, allShots]);

  const slopes = useMemo(() => {
    const s = new Set<string>();
    shots.forEach((sh) => {
      const v = safeStr(sh.putt_slope) || safeStr(sh.slope);
      if (v) s.add(v);
    });
    return ["All", ...Array.from(s).sort()];
  }, [shots]);

  const breaks = useMemo(() => {
    const s = new Set<string>();
    shots.forEach((sh) => {
      const v = safeStr(sh.putt_break);
      if (v) s.add(v);
    });
    return ["All", ...Array.from(s).sort()];
  }, [shots]);

  const filtered = shots.filter((s) => {
    const pd = safeNum(s.putt_distance);
    if (dist !== "All" && bucketFor(pd, PUTT_DISTANCE_BUCKETS) !== dist) return false;
    const key = `${s.hole_number}-${allShots.indexOf(s)}`;
    if (from !== "All" && (hittingFromMap.get(key) || "Unknown") !== from) return false;
    const sl = safeStr(s.putt_slope) || safeStr(s.slope);
    if (slope !== "All" && sl !== slope) return false;
    if (!passes(s, "putt_break", brk)) return false;
    return true;
  });

  if (shots.length === 0)
    return <p className="text-xs text-gray-400 text-center py-4">No putting data.</p>;

  // Make % summary
  const made = filtered.filter((s) => normalizePuttResult(s.putt_result) === "made").length;
  const totalPuttShots = filtered.length || 1;
  const makePct = Math.round((made / totalPuttShots) * 100);
  const leaves = filtered
    .filter((s) => normalizePuttResult(s.putt_result) !== "made")
    .map((s) => safeNum(s.putt_distance_remaining))
    .filter((v): v is number => v != null);
  const avgLeave = leaves.length ? leaves.reduce((a, b) => a + b, 0) / leaves.length : 0;

  // Miss tendency (putt_result distribution)
  const puttResultCounts: Record<string, number> = {};
  PUTT_MISS_DIRS.forEach((d) => (puttResultCounts[d.key] = 0));
  filtered.forEach((s) => {
    const r = normalizePuttResult(s.putt_result);
    puttResultCounts[r] = (puttResultCounts[r] || 0) + 1;
  });

  // Speed analysis
  const speedHit = filtered.filter((s) => {
    const r = normalizePuttResult(s.putt_result);
    return r === "made";
  }).length;
  const speedMissed = filtered.length - speedHit;
  const hardCount = filtered.filter((s) => {
    const sp = safeStr(s.putt_hit_speed).toLowerCase();
    return sp.includes("hard") || sp.includes("firm") || sp.includes("aggressive");
  }).length;
  const softCount = filtered.filter((s) => {
    const sp = safeStr(s.putt_hit_speed).toLowerCase();
    return sp.includes("soft") || sp.includes("easy") || sp.includes("gentle");
  }).length;

  // Line analysis
  const lineHit = speedHit;
  const lineMissed = speedMissed;
  const pullCount = filtered.filter((s) => {
    const ln = safeStr(s.putt_hit_line).toLowerCase();
    return ln.includes("pull") || ln.includes("left");
  }).length;
  const pushCount = filtered.filter((s) => {
    const ln = safeStr(s.putt_hit_line).toLowerCase();
    return ln.includes("push") || ln.includes("right");
  }).length;

  // Make % by distance
  const distMake = PUTT_DISTANCE_BUCKETS.map((b) => {
    const inBucket = filtered.filter((s) => {
      const pd = safeNum(s.putt_distance);
      return pd != null && pd >= b.min && pd < b.max;
    });
    const m = inBucket.filter((s) => normalizePuttResult(s.putt_result) === "made").length;
    return { label: b.label, made: m, total: inBucket.length };
  });

  // Make % by slope
  const slopeMakeMap: Record<string, { made: number; total: number }> = {};
  filtered.forEach((s) => {
    const sl = safeStr(s.putt_slope) || safeStr(s.slope) || "Flat";
    if (!slopeMakeMap[sl]) slopeMakeMap[sl] = { made: 0, total: 0 };
    slopeMakeMap[sl].total++;
    if (normalizePuttResult(s.putt_result) === "made") slopeMakeMap[sl].made++;
  });

  // Make % by break
  const breakMakeMap: Record<string, { made: number; total: number }> = {};
  filtered.forEach((s) => {
    const bk = safeStr(s.putt_break) || "None";
    if (!breakMakeMap[bk]) breakMakeMap[bk] = { made: 0, total: 0 };
    breakMakeMap[bk].total++;
    if (normalizePuttResult(s.putt_result) === "made") breakMakeMap[bk].made++;
  });

  return (
    <div>
      <SubHeading>Distance</SubHeading>
      <ChipRow options={["All", ...PUTT_DISTANCE_BUCKETS.map((b) => b.label)]} value={dist} onChange={setDist} />
      <SubHeading>Hitting From</SubHeading>
      <ChipRow options={froms} value={from} onChange={setFrom} />
      <SubHeading>Slope</SubHeading>
      <ChipRow options={slopes} value={slope} onChange={setSlope} />
      <SubHeading>Break</SubHeading>
      <ChipRow options={breaks} value={brk} onChange={setBrk} />

      <p className="text-[10px] text-gray-400 mt-2 mb-1">{filtered.length} putts</p>

      {/* Putt Scatter Plot */}
      <SubHeading>Putt Scatter</SubHeading>
      <PuttScatter shots={filtered} />

      {/* Make % summary */}
      <SubHeading>Make %</SubHeading>
      <div className="flex gap-2">
        <div className="flex-1 bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-green-700">
            {makePct}%
          </p>
          <p className="text-[10px] text-gray-500">
            {made}/{filtered.length}
          </p>
        </div>
        <div className="flex-1 bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-green-700">{avgLeave.toFixed(1)}</p>
          <p className="text-[10px] text-gray-500">Avg Leave (ft)</p>
        </div>
      </div>

      {/* Miss Tendency */}
      <SubHeading>Miss Tendency</SubHeading>
      <div className="space-y-1">
        {PUTT_MISS_DIRS.map((d) => {
          const c = puttResultCounts[d.key] || 0;
          if (c === 0 && d.key !== "made") return null;
          const pct = filtered.length ? (c / filtered.length) * 100 : 0;
          return (
            <div key={d.key} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-600 w-20 truncate">{d.key}</span>
              <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: d.color, minWidth: c > 0 ? "16px" : "0" }}
                />
              </div>
              <span className="text-[10px] font-semibold text-gray-700 w-10 text-right">
                {c} ({Math.round(pct)}%)
              </span>
            </div>
          );
        })}
      </div>

      {/* Speed analysis */}
      <SubHeading>Speed Analysis</SubHeading>
      <div className="text-[11px] text-gray-600 space-y-0.5">
        <div>Hit Speed: <b className="text-green-700">{speedHit}</b> &nbsp;|&nbsp; Missed Speed: <b className="text-red-600">{speedMissed}</b></div>
        <div>Hard: <b>{hardCount}</b> &nbsp;|&nbsp; Soft: <b>{softCount}</b></div>
      </div>

      {/* Line analysis */}
      <SubHeading>Line Analysis</SubHeading>
      <div className="text-[11px] text-gray-600 space-y-0.5">
        <div>Hit Line: <b className="text-green-700">{lineHit}</b> &nbsp;|&nbsp; Missed Line: <b className="text-red-600">{lineMissed}</b></div>
        <div>Pull: <b>{pullCount}</b> &nbsp;|&nbsp; Push: <b>{pushCount}</b></div>
      </div>

      {/* Make % by Distance */}
      <SubHeading>Make % by Distance</SubHeading>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-gray-400">
              <th className="text-left font-medium py-1">Distance</th>
              <th className="text-center font-medium">Made</th>
              <th className="text-center font-medium">Bar</th>
              <th className="text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {distMake.map((d) => {
              const pct = d.total ? Math.round((d.made / d.total) * 100) : 0;
              return (
                <tr key={d.label} className="border-t border-gray-100">
                  <td className="py-1 text-gray-600">{d.label}</td>
                  <td className="text-center text-gray-600">
                    {d.made}/{d.total}
                  </td>
                  <td className="px-1">
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: PRIMARY, minWidth: d.made > 0 ? "10px" : "0" }}
                      />
                    </div>
                  </td>
                  <td className="text-right font-semibold text-green-700">{d.total ? `${pct}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Make % by Slope */}
      {Object.keys(slopeMakeMap).length > 0 && (
        <>
          <SubHeading>Make % by Slope</SubHeading>
          <MakeList data={slopeMakeMap} colorMap={SLOPE_COLOR} />
        </>
      )}

      {/* Make % by Break */}
      {Object.keys(breakMakeMap).length > 0 && (
        <>
          <SubHeading>Make % by Break</SubHeading>
          <MakeList data={breakMakeMap} />
        </>
      )}
    </div>
  );
}

function MakeList({
  data,
  colorMap,
}: {
  data: Record<string, { made: number; total: number }>;
  colorMap?: Record<string, string>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1].total - a[1].total);
  const maxTotal = Math.max(...entries.map((e) => e[1].total), 1);
  return (
    <div className="space-y-1">
      {entries.map(([key, v]) => {
        const pct = v.total ? Math.round((v.made / v.total) * 100) : 0;
        const color = colorMap?.[key] || PRIMARY;
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600 w-16 truncate">{key}</span>
            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${(v.total / maxTotal) * 100}%`, backgroundColor: color, opacity: 0.35, minWidth: "16px" }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${(v.made / maxTotal) * 100}%`, backgroundColor: color, minWidth: v.made > 0 ? "10px" : "0" }}
              />
            </div>
            <span className="text-[10px] font-semibold text-gray-700 w-14 text-right">
              {v.made}/{v.total} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============ Putt Scatter Plot (SVG) ============
function PuttScatter({ shots }: { shots: any[] }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Green circle */}
        <circle cx={cx} cy={cy} r={r} fill={OFF_WHITE} stroke={PRIMARY} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={r * 0.5} fill="none" stroke={PRIMARY} strokeWidth={1} opacity={0.3} />
        {/* Hole */}
        <circle cx={cx} cy={cy} r={4} fill="#1a1a1a" />

        {shots.map((s, i) => {
          const result = normalizePuttResult(s.putt_result);
          const sl = safeStr(s.putt_slope) || safeStr(s.slope) || "Flat";
          const color = SLOPE_COLOR[sl] || "#6b7280";

          if (result === "made") {
            // dot at center
            return <circle key={i} cx={cx} cy={cy} r={3} fill={color} stroke="#fff" strokeWidth={0.5} />;
          }

          // missed — line from center
          const compass = PUTT_RESULT_TO_COMPASS[result] || "N";
          const angle = PUTT_RESULT_ANGLE[compass] ?? 0;
          const orig = safeNum(s.putt_distance) ?? 0;
          const rem = safeNum(s.putt_distance_remaining) ?? 0;
          const ratio = orig > 0 ? rem / orig : 0.5;
          const len = Math.min(Math.max(ratio, 0.15), 1) * r;
          const rad = (angle * Math.PI) / 180;
          const x2 = cx + len * Math.sin(rad);
          const y2 = cy - len * Math.cos(rad);
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={color} strokeWidth={2} strokeLinecap="round" />
              <circle cx={x2} cy={y2} r={2.5} fill={color} stroke="#fff" strokeWidth={0.5} />
            </g>
          );
        })}
      </svg>
      {/* Slope legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
        {Object.entries(SLOPE_COLOR).map(([k, c]) => (
          <span key={k} className="flex items-center text-[9px] text-gray-500">
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: c }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
