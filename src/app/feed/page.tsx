"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatDate, parseNotes, calcRoundStats, totalScoreColor } from "@/lib/constants";
import type { Round, Course, HoleScore } from "@/lib/constants";

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  handicap: number | null;
  home_course: string | null;
  bio: string | null;
}

interface FeedRound extends Round {
  sb_courses?: Course | null;
  sb_profiles?: Profile | null;
}

export default function FeedPage() {
  const { user } = useAuth();
  const profile = user; // user IS the profile now
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [feedRounds, setFeedRounds] = useState<FeedRound[]>([]);
  const [scoresByRound, setScoresByRound] = useState<Record<string, HoleScore[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  // Load following list
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: follows } = await supabase
        .from("sb_follows")
        .select("followee_id")
        .eq("follower_id", user.id);
      const ids = (follows || []).map((f) => f.followee_id);
      setFollowingIds(ids);
      setFollowingSet(new Set(ids));
    })();
  }, [user]);

  // Load feed (rounds from people you follow)
  useEffect(() => {
    if (!user || followingIds.length === 0) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data: rounds } = await supabase
        .from("sb_rounds")
        .select("*, sb_courses(id, name, city, state, num_holes), sb_profiles!sb_rounds_user_id_fkey(id, username, display_name, handicap)")
        .in("user_id", [...followingIds, user.id])
        .eq("is_complete", true)
        .eq("visibility", "public")
        .order("date_played", { ascending: false })
        .limit(30);

      const rds = (rounds || []) as FeedRound[];
      setFeedRounds(rds);

      // Load hole scores for feed rounds
      if (rds.length > 0) {
        const { data: scores } = await supabase
          .from("sb_hole_scores")
          .select("id, round_id, hole_number, par, score, putts, fairway_hit, gir, penalties, proximity")
          .in("round_id", rds.map((r) => r.id))
          .order("hole_number");
        const byRound: Record<string, HoleScore[]> = {};
        (scores || []).forEach((s: any) => {
          if (!byRound[s.round_id]) byRound[s.round_id] = [];
          byRound[s.round_id].push(s as HoleScore);
        });
        setScoresByRound(byRound);
      }
      setLoading(false);
    })();
  }, [user, followingIds]);

  // Search users
  const searchUsers = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim() || q.length < 2 || !user) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from("sb_profiles")
      .select("id, username, display_name, handicap, home_course, bio")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq("id", user.id)
      .limit(10);
    setSearchResults((data || []) as Profile[]);
  };

  const toggleFollow = async (targetId: string) => {
    if (!user) return;
    if (followingSet.has(targetId)) {
      await supabase
        .from("sb_follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("followee_id", targetId);
      setFollowingSet((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    } else {
      await supabase
        .from("sb_follows")
        .insert({ follower_id: user.id, followee_id: targetId });
      setFollowingSet((prev) => new Set(prev).add(targetId));
    }
  };

  if (!user) {
    return (
      <div className="px-4 pt-20 text-center">
        <p className="text-lg font-bold text-green-800">Sign in to see the feed</p>
        <p className="text-sm text-gray-400 mt-1">Create an account or log in to follow friends</p>
        <Link href="/auth" className="mt-4 inline-block text-sm px-4 py-2 rounded-full bg-green-700 text-white font-semibold">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <h1 className="text-2xl font-bold text-green-800 mb-4">Feed</h1>

      {/* Search users */}
      <div className="mb-4">
        <input
          type="search"
          placeholder="Search golfers by name or username..."
          value={searchQuery}
          onChange={(e) => searchUsers(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-green-600 mb-2"
        />
        {searchResults.length > 0 && (
          <div className="space-y-1">
            {searchResults.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-100"
              >
                <div className="w-10 h-10 rounded-full bg-green-700 flex items-center justify-center text-white font-bold">
                  {(p.display_name || p.username || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {p.display_name || p.username}
                  </p>
                  <p className="text-xs text-gray-500">
                    @{p.username}
                    {p.handicap != null && ` · ${p.handicap} HDCP`}
                  </p>
                </div>
                <button
                  onClick={() => toggleFollow(p.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    followingSet.has(p.id)
                      ? "bg-gray-200 text-gray-600"
                      : "bg-green-700 text-white"
                  }`}
                >
                  {followingSet.has(p.id) ? "Following" : "Follow"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading feed...</div>
      ) : feedRounds.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-2">🏌️</p>
          <p className="text-sm font-bold text-gray-700">No rounds in your feed yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Search for friends above and follow them to see their rounds here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedRounds.map((round) => {
            const stats = calcRoundStats(scoresByRound[round.id] || []);
            const roundScores = scoresByRound[round.id] || [];
            const roundPar = roundScores.reduce((sum, s) => sum + (s.par || 0), 0);
            const isOwnRound = round.user_id === user.id;
            const poster = round.sb_profiles;
            return (
              <div
                key={round.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                {/* Poster info */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center text-white text-xs font-bold">
                    {(poster?.display_name || poster?.username || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {isOwnRound
                        ? "You"
                        : poster?.display_name || poster?.username || "Unknown"}
                    </p>
                    <p className="text-xs text-gray-400">{formatDate(round.date_played)}</p>
                  </div>
                  {parseNotes(round.notes).round_type === "tournament" && (
                    <span className="text-sm">🏆</span>
                  )}
                </div>

                {/* Round summary */}
                <Link href="/rounds" className="block">
                  <div className="flex items-center justify-between bg-green-50 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {round.sb_courses?.name || "Unknown Course"}
                      </p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-600">
                        {stats.fwPct != null && <span>FW {stats.fwPct}%</span>}
                        {stats.girPct != null && <span>GIR {stats.girPct}%</span>}
                        {stats.avgPutts != null && <span>{stats.avgPutts.toFixed(1)} putts</span>}
                        {stats.birdies > 0 && <span>🐦 {stats.birdies}</span>}
                      </div>
                    </div>
                    <span
                      className="text-3xl font-bold ml-2"
                      style={{ color: totalScoreColor(round.total_score, roundPar) }}
                    >
                      {round.total_score}
                    </span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Share app */}
      <div className="mt-4 bg-green-700 rounded-xl p-4 text-center">
        <p className="text-sm text-white font-semibold mb-2">Invite friends to Sandbagger</p>
        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: "Sandbagger — Golf Stats",
                text: `Follow me on Sandbagger! ${profile?.username ? `@${profile.username}` : ""}`,
                url: window.location.origin,
              });
            } else {
              navigator.clipboard.writeText(window.location.origin);
              alert("Link copied! Share it with your golf friends.");
            }
          }}
          className="px-4 py-2 rounded-full bg-amber-400 text-green-800 text-sm font-bold"
        >
          Share App
        </button>
      </div>
    </div>
  );
}
