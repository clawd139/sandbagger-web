"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { USER_ID, calcRoundStats, parseNotes, formatDate } from "@/lib/constants";
import type { Round, Course, HoleScore } from "@/lib/constants";

interface RoundWithCourse extends Round {
  sb_courses?: Course | null;
}

export default function StatsPage() {
  const [rounds, setRounds] = useState<RoundWithCourse[]>([]);
  const [allScores, setAllScores] = useState<HoleScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: roundsData } = await supabase
        .from("sb_rounds")
        .select("*, sb_courses(id, name, city, state, num_holes)")
        .eq("user_id", USER_ID)
        .eq("is_complete", true)
        .order("date_played", { ascending: false });

      const rds = (roundsData || []) as RoundWithCourse[];
      setRounds(rds);

      if (rds.length > 0) {
        const { data: scores } = await supabase
          .from("sb_hole_scores")
          .select("id, round_id, hole_number, par, score, putts, fairway_hit, fairway_miss_dir, gir, penalties, proximity, notes")
          .in("round_id", rds.map((r) => r.id))
          .order("hole_number");
        setAllScores((scores || []) as HoleScore[]);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="px-4 pt-10 text-center text-gray-400 text-sm">
        Loading stats...
      </div>
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

  // Overall stats
  const overallStats = calcRoundStats(allScores);
  const scores = rounds.map((r) => r.total_score).filter((s) => s > 0);
  const avgScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  const bestScore = scores.length ? Math.min(...scores) : 0;
  const worstScore = scores.length ? Math.max(...scores) : 0;
  const totalRounds = rounds.length;

  // Tournament vs practice
  const tournamentRounds = rounds.filter((r) => parseNotes(r.notes).round_type === "tournament");
  const practiceRounds = rounds.filter((r) => parseNotes(r.notes).round_type !== "tournament");

  // Score distribution (bars)
  const scoreBuckets: Record<string, number> = {};
  scores.forEach((s) => {
    const bucket = s < 75 ? "<75" : s < 80 ? "75-79" : s < 85 ? "80-84" : s < 90 ? "85-89" : s < 95 ? "90-94" : s < 100 ? "95-99" : "100+";
    scoreBuckets[bucket] = (scoreBuckets[bucket] || 0) + 1;
  });
  const maxBucket = Math.max(...Object.values(scoreBuckets), 1);
  const bucketOrder = ["<75", "75-79", "80-84", "85-89", "90-94", "95-99", "100+"];

  // Fairway breakdown
  const fwHoles = allScores.filter((h) => h.fairway_hit !== null);
  const fwHit = fwHoles.filter((h) => h.fairway_hit === true).length;
  const fwMissL = fwHoles.filter((h) => h.fairway_hit === false && h.fairway_miss_dir === "L").length;
  const fwMissR = fwHoles.filter((h) => h.fairway_hit === false && h.fairway_miss_dir === "R").length;
  const fwMissC = fwHoles.filter((h) => h.fairway_hit === false && h.fairway_miss_dir === "C").length;
  const fwTotal = fwHoles.length || 1;

  // Putts breakdown
  const puttHoles = allScores.filter((h) => h.putts !== null && h.putts > 0);
  const zeroPutts = puttHoles.filter((h) => h.putts === 0).length;
  const onePutts = puttHoles.filter((h) => h.putts === 1).length;
  const twoPutts = puttHoles.filter((h) => h.putts === 2).length;
  const threePutts = puttHoles.filter((h) => (h.putts || 0) >= 3).length;
  const puttTotal = puttHoles.length || 1;

  // Proximity stats (feet from hole)
  const proxHoles = allScores.filter((h) => h.proximity != null && h.proximity > 0);
  const avgProx = proxHoles.length ? Math.round(proxHoles.reduce((s, h) => s + (h.proximity || 0), 0) / proxHoles.length) : null;

  // Scoring breakdown (par 3/4/5)
  const par3Scores = allScores.filter((h) => h.par === 3 && h.score > 0);
  const par4Scores = allScores.filter((h) => h.par === 4 && h.score > 0);
  const par5Scores = allScores.filter((h) => h.par === 5 && h.score > 0);
  const avgPar3 = par3Scores.length ? (par3Scores.reduce((s, h) => s + h.score, 0) / par3Scores.length).toFixed(1) : "—";
  const avgPar4 = par4Scores.length ? (par4Scores.reduce((s, h) => s + h.score, 0) / par4Scores.length).toFixed(1) : "—";
  const avgPar5 = par5Scores.length ? (par5Scores.reduce((s, h) => s + h.score, 0) / par5Scores.length).toFixed(1) : "—";

  // GIR when hit vs miss → avg putts
  const girHit = allScores.filter((h) => h.gir === true && h.putts != null);
  const girMiss = allScores.filter((h) => h.gir === false && h.putts != null);
  const avgPuttsGIR = girHit.length ? (girHit.reduce((s, h) => s + (h.putts || 0), 0) / girHit.length).toFixed(1) : "—";
  const avgPuttsNoGIR = girMiss.length ? (girMiss.reduce((s, h) => s + (h.putts || 0), 0) / girMiss.length).toFixed(1) : "—";

  return (
    <div className="px-4 pt-4 pb-4">
      <h1 className="text-2xl font-bold text-green-800 mb-4">Stats</h1>

      {/* Overview cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatBox label="Rounds" value={String(totalRounds)} />
        <StatBox label="Avg Score" value={String(avgScore)} />
        <StatBox label="Best" value={String(bestScore)} />
      </div>

      {/* Key Stats */}
      <Section title="Key Stats">
        <StatRow label="Fairway Hit %" value={overallStats.fwPct != null ? `${overallStats.fwPct}%` : "—"} />
        <StatRow label="GIR %" value={overallStats.girPct != null ? `${overallStats.girPct}%` : "—"} />
        <StatRow label="Putts per Hole" value={overallStats.avgPutts != null ? overallStats.avgPutts.toFixed(1) : "—"} />
        <StatRow label="Putts per GIR" value={avgPuttsGIR} />
        <StatRow label="Putts per no-GIR" value={avgPuttsNoGIR} />
        <StatRow label="Avg Proximity" value={avgProx != null ? `${avgProx} ft` : "—"} />
        <StatRow label="Birdies" value={String(overallStats.birdies)} />
        <StatRow label="Eagles" value={String(overallStats.eagles)} />
        <StatRow label="Bogeys" value={String(overallStats.bogeys)} />
        <StatRow label="3-Putts" value={String(overallStats.threePutts)} />
      </Section>

      {/* Score by Par */}
      <Section title="Scoring by Par">
        <div className="flex gap-3">
          <ParBar label="Par 3" value={avgPar3} color="#7c3aed" />
          <ParBar label="Par 4" value={avgPar4} color="#0a7d32" />
          <ParBar label="Par 5" value={avgPar5} color="#d4a843" />
        </div>
      </Section>

      {/* Score Distribution */}
      <Section title="Score Distribution">
        <div className="flex items-end justify-between gap-1 h-24">
          {bucketOrder.map((bucket) => {
            const count = scoreBuckets[bucket] || 0;
            const heightPct = (count / maxBucket) * 100;
            return (
              <div key={bucket} className="flex-1 flex flex-col items-center">
                <div className="text-[10px] text-gray-500 mb-0.5">{count > 0 ? count : ""}</div>
                <div
                  className="w-full rounded-t bg-green-600 min-h-[2px] transition-all"
                  style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%` }}
                />
                <div className="text-[9px] text-gray-400 mt-1 text-center leading-tight">{bucket}</div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Fairway Breakdown */}
      {fwHoles.length > 0 && (
        <Section title={`Fairway Breakdown (${fwHoles.length} holes)`}>
          <div className="flex gap-1 mb-2">
            <BarSegment label="Hit" count={fwHit} total={fwTotal} color="#0a7d32" />
            <BarSegment label="Left" count={fwMissL} total={fwTotal} color="#f59e0b" />
            <BarSegment label="Center" count={fwMissC} total={fwTotal} color="#6b7280" />
            <BarSegment label="Right" count={fwMissR} total={fwTotal} color="#ef4444" />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Hit: {Math.round((fwHit / fwTotal) * 100)}%</span>
            <span>L: {Math.round((fwMissL / fwTotal) * 100)}%</span>
            <span>C: {Math.round((fwMissC / fwTotal) * 100)}%</span>
            <span>R: {Math.round((fwMissR / fwTotal) * 100)}%</span>
          </div>
        </Section>
      )}

      {/* Putting Breakdown */}
      {puttHoles.length > 0 && (
        <Section title={`Putting Breakdown (${puttHoles.length} holes)`}>
          <div className="flex gap-1 mb-2">
            <BarSegment label="0-putt" count={zeroPutts} total={puttTotal} color="#7c3aed" />
            <BarSegment label="1-putt" count={onePutts} total={puttTotal} color="#0a7d32" />
            <BarSegment label="2-putt" count={twoPutts} total={puttTotal} color="#d4a843" />
            <BarSegment label="3+" count={threePutts} total={puttTotal} color="#dc2626" />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>0: {zeroPutts}</span>
            <span>1: {onePutts} ({Math.round((onePutts / puttTotal) * 100)}%)</span>
            <span>2: {twoPutts} ({Math.round((twoPutts / puttTotal) * 100)}%)</span>
            <span>3+: {threePutts}</span>
          </div>
        </Section>
      )}

      {/* Recent Rounds */}
      <Section title="Round History">
        <div className="space-y-1">
          {rounds.slice(0, 10).map((round) => {
            const notes = parseNotes(round.notes);
            const isTournament = notes.round_type === "tournament";
            return (
              <Link
                key={round.id}
                href="/rounds"
                className="flex items-center justify-between py-1.5 border-b border-gray-100"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {round.sb_courses?.name || "Unknown"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatDate(round.date_played)}
                    {isTournament && " 🏆"}
                  </p>
                </div>
                <span className="text-lg font-bold text-green-700 ml-2">
                  {round.total_score}
                </span>
              </Link>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// Helper components
function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-green-700 rounded-xl p-3 text-center">
      <p className="text-2xl font-bold text-amber-400 leading-tight">{value}</p>
      <p className="text-[10px] text-white opacity-80">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
      <h2 className="text-sm font-bold text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-50">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-bold text-green-700">{value}</span>
    </div>
  );
}

function ParBar({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex-1 text-center">
      <div
        className="rounded-lg py-3 mb-1 text-white font-bold"
        style={{ backgroundColor: color }}
      >
        {value}
      </div>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function BarSegment({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex-1 text-center">
      <div className="h-8 rounded-t flex items-end justify-center text-[10px] text-white font-bold overflow-hidden">
        <div
          className="w-full rounded-t flex items-end justify-center pb-0.5"
          style={{ height: `${Math.max(pct, count > 0 ? 10 : 0)}%`, backgroundColor: color, minHeight: count > 0 ? "12px" : "0" }}
        >
          {count > 0 && count}
        </div>
      </div>
      <p className="text-[9px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}
