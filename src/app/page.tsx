"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { USER_ID, formatDate, parseNotes, calcRoundStats } from "@/lib/constants";
import type { Course, Round, HoleScore } from "@/lib/constants";
import ScoreBadge from "@/components/ScoreBadge";

export default function Home() {
  const { user } = useAuth();
  const activeUserId = user?.id || USER_ID;
  const [courses, setCourses] = useState<Course[]>([]);
  const [recentRounds, setRecentRounds] = useState<(Round & { sb_courses?: Course | null })[]>([]);
  const [allHoleScores, setAllHoleScores] = useState<HoleScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Register service worker for PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    (async () => {
      // Load courses and recent rounds in parallel
      const [coursesRes, roundsRes] = await Promise.all([
        supabase.from("sb_courses").select("*").order("name"),
        supabase
          .from("sb_rounds")
          .select("*, sb_courses(id, name, city, state, num_holes)")
          .eq("user_id", activeUserId)
          .eq("is_complete", true)
          .order("date_played", { ascending: false })
          .limit(5),
      ]);

      setCourses(coursesRes.data || []);
      const rounds = (roundsRes.data || []) as (Round & { sb_courses?: Course | null })[];
      setRecentRounds(rounds);

      // Load all hole scores for quick stats
      if (rounds.length > 0) {
        const roundIds = rounds.map((r) => r.id);
        const { data: scores } = await supabase
          .from("sb_hole_scores")
          .select("id, round_id, hole_number, par, score, putts, fairway_hit, gir, penalties, wedge_and_in, proximity, notes")
          .in("round_id", roundIds)
          .order("hole_number");
        setAllHoleScores((scores || []) as HoleScore[]);
      }

      setLoading(false);
    })();
  }, []);

  // Quick stats from recent rounds
  const stats = calcRoundStats(allHoleScores);
  const avgScore = recentRounds.length
    ? Math.round((recentRounds.reduce((s, r) => s + (r.total_score || 0), 0) / recentRounds.length) * 10) / 10
    : null;

  const filteredCourses = courses.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q) ||
      (c.state || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="px-4 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold text-green-800">Sandbagger</h1>
        <Link
          href="/rounds/new"
          className="text-xs px-3 py-1.5 rounded-full bg-green-700 text-white font-semibold"
        >
          + Log Round
        </Link>
      </div>

      {/* Quick links */}
      <div className="flex gap-2 mb-3">
        <Link href="/rounds" className="flex-1 bg-white rounded-xl p-2.5 text-center shadow-sm border border-gray-100 active:scale-[0.98] transition-transform">
          <span className="text-sm font-semibold text-green-700">📋 My Rounds</span>
        </Link>
        <Link href="/courses" className="flex-1 bg-white rounded-xl p-2.5 text-center shadow-sm border border-gray-100 active:scale-[0.98] transition-transform">
          <span className="text-sm font-semibold text-green-700">⛳ Courses</span>
        </Link>
      </div>

      {/* Quick Stats Summary */}
      {recentRounds.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <StatCard label="Avg Score" value={avgScore != null ? String(avgScore) : "—"} />
          <StatCard label="Fairways" value={stats.fwPct != null ? `${stats.fwPct}%` : "—"} />
          <StatCard label="GIR" value={stats.girPct != null ? `${stats.girPct}%` : "—"} />
          <StatCard label="Putts/Hole" value={stats.avgPutts != null ? stats.avgPutts.toFixed(1) : "—"} />
        </div>
      )}

      {/* Recent Rounds */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-700">Recent Rounds</h2>
          {recentRounds.length > 0 && (
            <Link href="/rounds" className="text-xs text-green-700 font-medium">
              View all →
            </Link>
          )}
        </div>
        {recentRounds.length === 0 && !loading ? (
          <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
            <p className="text-sm text-gray-400">No rounds yet</p>
            <Link href="/rounds/new" className="text-xs text-green-700 font-medium mt-1 inline-block">
              Log your first round →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentRounds.slice(0, 3).map((round) => {
              const notes = parseNotes(round.notes);
              const isTournament = notes.round_type === "tournament";
              return (
                <Link
                  key={round.id}
                  href={`/rounds`}
                  className="block bg-white rounded-xl p-3 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {round.sb_courses?.name || "Unknown Course"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(round.date_played)}
                        {isTournament && <span className="ml-1">🏆</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-green-700">{round.total_score}</span>
                      {round.sb_courses && (
                        <p className="text-[10px] text-gray-400">
                          {round.sb_courses.num_holes} holes
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Course Browser */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-700">Courses</h2>
          <span className="text-xs text-gray-400">{courses.length} total</span>
        </div>
        <input
          type="search"
          placeholder="Search courses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 mb-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-green-600"
        />
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading courses...</div>
        ) : (
          <div className="space-y-2">
            {filteredCourses.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="block bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{course.name}</h3>
                    <p className="text-sm text-gray-500">
                      {course.city}
                      {course.state ? `, ${course.state}` : ""}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                    {course.num_holes} holes
                  </span>
                </div>
              </Link>
            ))}
            {filteredCourses.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">No courses found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-green-700 rounded-lg p-2 text-center">
      <p className="text-lg font-bold text-amber-400 leading-tight">{value}</p>
      <p className="text-[10px] text-white opacity-80 leading-tight">{label}</p>
    </div>
  );
}
