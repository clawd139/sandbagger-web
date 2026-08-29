"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Full list of selectable clubs in display order.
// The numeric irons 2i–9i are expanded individually so each can be toggled.
// They're grouped together in the UI under "Irons".
const ALL_CLUBS: { type: string; label: string; group: string }[] = [
  { type: "Driver", label: "Driver", group: "Woods" },
  { type: "3W", label: "3 Wood", group: "Woods" },
  { type: "5W", label: "5 Wood", group: "Woods" },
  { type: "7W", label: "7 Wood", group: "Woods" },
  { type: "Hybrid", label: "Hybrid", group: "Woods" },
  { type: "2i", label: "2 Iron", group: "Irons" },
  { type: "3i", label: "3 Iron", group: "Irons" },
  { type: "4i", label: "4 Iron", group: "Irons" },
  { type: "5i", label: "5 Iron", group: "Irons" },
  { type: "6i", label: "6 Iron", group: "Irons" },
  { type: "7i", label: "7 Iron", group: "Irons" },
  { type: "8i", label: "8 Iron", group: "Irons" },
  { type: "9i", label: "9 Iron", group: "Irons" },
  { type: "PW", label: "Pitching Wedge", group: "Wedges" },
  { type: "GW", label: "Gap Wedge", group: "Wedges" },
  { type: "SW", label: "Sand Wedge", group: "Wedges" },
  { type: "LW", label: "Lob Wedge", group: "Wedges" },
  { type: "Putter", label: "Putter", group: "Putter" },
];

interface BagClub {
  club_type: string;
  club_name: string | null;
  display_order: number;
}

export default function BagBuilder() {
  const { user } = useAuth();
  // Map of club_type -> { enabled, customName }
  const [clubs, setClubs] = useState<Record<string, { enabled: boolean; customName: string }>>(
    () => {
      const initial: Record<string, { enabled: boolean; customName: string }> = {};
      for (const c of ALL_CLUBS) {
        initial[c.type] = { enabled: false, customName: "" };
      }
      return initial;
    }
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Load existing bag from sb_bag_clubs
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("sb_bag_clubs")
          .select("club_type, club_name, display_order")
          .eq("user_id", user.id)
          .order("display_order", { ascending: true });

        if (cancelled) return;

        if (error) {
          console.error("BagBuilder load error:", error.message);
          setLoading(false);
          return;
        }

        if (data && data.length > 0) {
          setClubs((prev) => {
            const next = { ...prev };
            for (const row of data as BagClub[]) {
              if (next[row.club_type]) {
                next[row.club_type] = {
                  enabled: true,
                  customName: row.club_name || "",
                };
              }
            }
            return next;
          });
        }
      } catch (err) {
        console.error("BagBuilder load exception:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggleClub = (clubType: string) => {
    setClubs((prev) => ({
      ...prev,
      [clubType]: {
        ...prev[clubType],
        enabled: !prev[clubType].enabled,
      },
    }));
  };

  const setCustomName = (clubType: string, name: string) => {
    setClubs((prev) => ({
      ...prev,
      [clubType]: { ...prev[clubType], customName: name },
    }));
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Delete existing rows then insert fresh — simplest correct sync
      const { error: delErr } = await supabase
        .from("sb_bag_clubs")
        .delete()
        .eq("user_id", user.id);
      if (delErr) {
        console.error("BagBuilder delete error:", delErr.message);
      }

      const enabledRows = ALL_CLUBS.filter((c) => clubs[c.type]?.enabled);
      if (enabledRows.length > 0) {
        const rows = enabledRows.map((c, idx) => ({
          user_id: user.id,
          club_type: c.type,
          club_name: clubs[c.type].customName.trim() || null,
          display_order: idx,
        }));
        const { error: insErr } = await supabase.from("sb_bag_clubs").insert(rows);
        if (insErr) {
          console.error("BagBuilder insert error:", insErr.message);
        }
      }

      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      console.error("BagBuilder save exception:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
        <h2 className="text-sm font-bold text-gray-700 mb-2">Build Your Bag</h2>
        <p className="text-xs text-gray-800">Loading…</p>
      </div>
    );
  }

  // Render clubs grouped by group name (Woods, Irons, Wedges, Putter)
  const groups = Array.from(new Set(ALL_CLUBS.map((c) => c.group)));
  const enabledCount = ALL_CLUBS.filter((c) => clubs[c.type]?.enabled).length;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700">Build Your Bag</h2>
        <span className="text-xs text-gray-800">{enabledCount} clubs</span>
      </div>
      <p className="text-xs text-gray-700">
        Tap to toggle the clubs you carry. Add an optional custom name (e.g. brand/model) for any club.
      </p>

      {groups.map((group) => (
        <div key={group}>
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
            {group}
          </p>
          <div className="space-y-1.5">
            {ALL_CLUBS.filter((c) => c.group === group).map((c) => {
              const state = clubs[c.type];
              const enabled = state?.enabled ?? false;
              return (
                <div
                  key={c.type}
                  className={`rounded-lg border transition-colors ${
                    enabled
                      ? "border-green-600 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleClub(c.type)}
                    className="w-full flex items-center justify-between px-3 py-2"
                  >
                    <span
                      className={`text-sm font-medium ${
                        enabled ? "text-gray-900" : "text-gray-700"
                      }`}
                    >
                      {c.label}
                    </span>
                    <span
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                        enabled
                          ? "border-green-700 bg-green-700 text-amber-400"
                          : "border-gray-300 bg-white text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                  {enabled && (
                    <div className="px-3 pb-2">
                      <input
                        type="text"
                        value={state?.customName ?? ""}
                        onChange={(e) => setCustomName(c.type, e.target.value)}
                        placeholder="Custom name (optional)"
                        className="w-full px-2.5 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:border-green-600"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2 rounded-lg bg-green-700 text-amber-400 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? "Saving..." : savedFlash ? "Saved!" : "Save Bag"}
      </button>
    </div>
  );
}
