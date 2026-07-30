"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  USER_ID,
  formatDate,
  parseNotes,
  calcRoundStats,
  detectTournaments,
} from "@/lib/constants";
import type { Round, Course, HoleScore } from "@/lib/constants";
import ScoreBadge from "@/components/ScoreBadge";

interface RoundWithCourse extends Round {
  sb_courses?: Course | null;
}

export default function RoundsPage() {
  const { user } = useAuth();
  const activeUserId = user?.id || USER_ID;
  const [rounds, setRounds] = useState<RoundWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [holeScoresByRound, setHoleScoresByRound] = useState<Record<string, HoleScore[]>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadRounds = useCallback(async () => {
    const { data: roundsData } = await supabase
      .from("sb_rounds")
      .select("*, sb_courses(id, name, city, state, num_holes)")
      .eq("user_id", activeUserId)
      .eq("is_complete", true)
      .order("date_played", { ascending: false });

    const rds = (roundsData || []) as RoundWithCourse[];
    setRounds(rds);
    setLoading(false);

    // Pre-load hole scores for all rounds
    if (rds.length > 0) {
      const roundIds = rds.map((r) => r.id);
      const { data: scores } = await supabase
        .from("sb_hole_scores")
        .select("id, round_id, hole_number, par, score, putts, fairway_hit, fairway_miss_dir, gir, penalties, wedge_and_in, proximity, notes")
        .in("round_id", roundIds)
        .order("hole_number");

      const byRound: Record<string, HoleScore[]> = {};
      (scores || []).forEach((s) => {
        const hs = s as HoleScore;
        if (!byRound[hs.round_id]) byRound[hs.round_id] = [];
        byRound[hs.round_id].push(hs);
      });
      setHoleScoresByRound(byRound);
    }
  }, []);

  useEffect(() => {
    loadRounds();
  }, [loadRounds]);

  // Tournament detection
  const tournamentMap = detectTournaments(rounds);

  const toggleExpand = (roundId: string) => {
    setExpandedId(expandedId === roundId ? null : roundId);
  };

  const handleDelete = async (roundId: string) => {
    await supabase.from("sb_hole_scores").delete().eq("round_id", roundId);
    await supabase.from("sb_rounds").delete().eq("id", roundId);
    setRounds((prev) => prev.filter((r) => r.id !== roundId));
    setExpandedId(null);
    setDeleteConfirm(null);
  };

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold text-green-800">Rounds</h1>
        <Link
          href="/rounds/new"
          className="text-sm px-3 py-1.5 rounded-full bg-green-700 text-white font-semibold"
        >
          + Log Round
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400 text-sm">Loading rounds...</div>
      ) : rounds.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">⛳</p>
          <p className="text-lg font-bold text-green-800">No rounds yet</p>
          <p className="text-sm text-gray-400 mt-1">Log your first round to get started!</p>
          <Link
            href="/rounds/new"
            className="mt-4 inline-block text-sm px-4 py-2 rounded-full bg-green-700 text-white font-semibold"
          >
            Log a Round
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => {
            const notes = parseNotes(round.notes);
            const isTournament = notes.round_type === "tournament" || tournamentMap.get(round.id);
            const isExpanded = expandedId === round.id;
            const scores = holeScoresByRound[round.id] || [];
            const stats = calcRoundStats(scores);
            const hasWedge = scores.some((s) => s.wedge_and_in != null);

            return (
              <div
                key={round.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                <button
                  onClick={() => toggleExpand(round.id)}
                  className="w-full text-left"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">
                        {round.sb_courses?.name || "Unknown Course"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(round.date_played)}
                        {isTournament && <span className="ml-1 text-sm">🏆</span>}
                        {notes.round_type === "practice" && !isTournament && (
                          <span className="ml-1 text-sm">🏋️</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold text-amber-500">{round.total_score}</span>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex gap-3 mt-2 text-xs">
                    {stats.fwPct != null && (
                      <span className="text-gray-600">
                        FW <span className="font-semibold text-green-700">{stats.fwPct}%</span>
                      </span>
                    )}
                    {stats.girPct != null && (
                      <span className="text-gray-600">
                        GIR <span className="font-semibold text-green-700">{stats.girPct}%</span>
                      </span>
                    )}
                    {stats.avgPutts != null && (
                      <span className="text-gray-600">
                        Putts <span className="font-semibold text-green-700">{stats.avgPutts.toFixed(1)}</span>
                      </span>
                    )}
                    {stats.birdies > 0 && (
                      <span className="text-gray-600">
                        🐦 <span className="font-semibold text-amber-500">{stats.birdies}</span>
                      </span>
                    )}
                    {stats.eagles > 0 && (
                      <span className="text-gray-600">
                        🦅 <span className="font-semibold text-amber-500">{stats.eagles}</span>
                      </span>
                    )}
                  </div>

                  {round.weather && (
                    <p className="text-xs text-gray-400 mt-1">🌤 {round.weather}</p>
                  )}
                  {notes.caption && (
                    <p className="text-xs text-gray-600 mt-1 italic">"{notes.caption}"</p>
                  )}
                </button>

                {/* Expanded scorecard */}
                {isExpanded && scores.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {/* Mini scorecard scroll */}
                    <div className="flex gap-1 overflow-x-auto pb-2">
                      {scores.map((hole, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col items-center min-w-[28px]"
                        >
                          <span className="text-[8px] text-gray-400">{hole.hole_number}</span>
                          <ScoreBadge score={hole.score} par={hole.par || 0} size="sm" />
                          <span className="text-[8px] text-gray-500 mt-0.5">
                            {hole.putts || "—"}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Detailed table */}
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-green-700 text-white">
                            <th className="px-2 py-1.5 text-left font-semibold rounded-l">Hole</th>
                            <th className="px-2 py-1.5 text-center font-semibold">Par</th>
                            <th className="px-2 py-1.5 text-center font-semibold">Score</th>
                            <th className="px-2 py-1.5 text-center font-semibold">Putts</th>
                            <th className="px-2 py-1.5 text-center font-semibold">FW</th>
                            <th className="px-2 py-1.5 text-center font-semibold rounded-r">GIR</th>
                            {hasWedge && <th className="px-2 py-1.5 text-center font-semibold">W&I</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {scores.map((hole, idx) => (
                            <tr
                              key={idx}
                              className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}
                            >
                              <td className="px-2 py-1.5 font-bold text-green-700">{hole.hole_number}</td>
                              <td className="px-2 py-1.5 text-center">{hole.par ?? "—"}</td>
                              <td className="px-2 py-1.5 text-center">
                                <ScoreBadge score={hole.score} par={hole.par || 0} size="sm" />
                              </td>
                              <td className="px-2 py-1.5 text-center">{hole.putts ?? "—"}</td>
                              <td className="px-2 py-1.5 text-center">
                                {hole.fairway_hit === null
                                  ? "—"
                                  : hole.fairway_hit
                                  ? "✓"
                                  : hole.fairway_miss_dir || "✗"}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {hole.gir ? "✓" : hole.gir === false ? "✗" : "—"}
                              </td>
                              {hasWedge && (
                                <td className="px-2 py-1.5 text-center">
                                  {hole.wedge_and_in != null ? hole.wedge_and_in : "—"}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-3">
                      {deleteConfirm === round.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(round.id)}
                            className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold"
                          >
                            Confirm Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="flex-1 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <Link
                            href={`/rounds/new?edit=${round.id}`}
                            className="flex-1 py-2 rounded-lg bg-green-700 text-amber-400 text-sm font-semibold text-center"
                          >
                            Edit Round
                          </Link>
                          <button
                            onClick={() => setDeleteConfirm(round.id)}
                            className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
