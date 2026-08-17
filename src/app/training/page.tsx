"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { USER_ID, formatDate } from "@/lib/constants";
import type { Course, TeeSet } from "@/lib/constants";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type DrillCategory = "tee" | "approach" | "short_game" | "distance_wedges" | "putting";
type MetricType = "success_attempts" | "streak" | "avg_distance" | "score_to_par" | "count" | null;
type PracticeType = "practice" | "on_course";

interface Drill {
  id: string;
  name: string;
  description: string | null;
  category: string;
  metric_type: MetricType;
  practice_type: PracticeType;
  is_shared: boolean;
  is_default: boolean;
  user_id: string | null;
}

interface DrillRound {
  id: string;
  drill_id: string;
  drill_name?: string;
  date_played: string;
  duration_minutes: number | null;
  category: string | null;
  notes: string | null;
  metrics: Record<string, any> | null;
  total_score: number | null;
  practice_type: PracticeType;
  course_id: string | null;
}

interface DrillLog {
  id: string;
  drill_round_id: string;
  hole_number: number | null;
  shot_intent: string | null;
  success: boolean | null;
  miss_direction: string | null;
  result: string | null;
  miss_detail: string | null;
  target_hit: string | null;
  club: string | null;
  notes: string | null;
}

const CATEGORIES: { key: DrillCategory; label: string; emoji: string }[] = [
  { key: "tee", label: "Tee", emoji: "🏌️" },
  { key: "approach", label: "Approach", emoji: "🎯" },
  { key: "short_game", label: "Short Game", emoji: "⛳" },
  { key: "distance_wedges", label: "Distance Wedges", emoji: "📐" },
  { key: "putting", label: "Putting", emoji: "🟢" },
];

const METRIC_TYPES: { value: MetricType; label: string }[] = [
  { value: null, label: "No metric" },
  { value: "success_attempts", label: "Success / Attempts" },
  { value: "streak", label: "Best Streak" },
  { value: "avg_distance", label: "Average Distance" },
  { value: "score_to_par", label: "Score to Par" },
  { value: "count", label: "Count" },
];

const MISS_DIRECTIONS = ["Long", "Short", "Left", "Right", "Long Left", "Long Right", "Short Left", "Short Right"];
const TARGET_HITS = ["on_target", "slightly_off", "missed"];

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────

export default function TrainingPage() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id || USER_ID;
  const [view, setView] = useState<"home" | "on_course" | "practice" | "add_drill" | "history" | "log_drill">("home");
  const [drills, setDrills] = useState<Drill[]>([]);
  const [rounds, setRounds] = useState<DrillRound[]>([]);
  const [loadingDrills, setLoadingDrills] = useState(true);

  // On-course state
  const [courses, setCourses] = useState<Course[]>([]);
  const [teeSets, setTeeSets] = useState<TeeSet[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedTee, setSelectedTee] = useState<string>("");
  const [onCourseCategory, setOnCourseCategory] = useState<DrillCategory>("tee");
  const [activeDrill, setActiveDrill] = useState<Drill | null>(null);

  // Practice state
  const [practiceCategory, setPracticeCategory] = useState<DrillCategory>("putting");

  // Log drill state
  const [logEntries, setLogEntries] = useState<any[]>([]);
  const [drillNotes, setDrillNotes] = useState("");
  const [drillDuration, setDrillDuration] = useState("");
  const [metricValue, setMetricValue] = useState("");

  // Add drill state
  const [newDrill, setNewDrill] = useState({
    name: "",
    description: "",
    category: "putting" as DrillCategory,
    metric_type: null as MetricType,
    practice_type: "practice" as PracticeType,
    is_shared: true,
  });

  // Load drills
  useEffect(() => {
    if (authLoading) return;
    setLoadingDrills(true);
    supabase
      .from("sb_drills")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name")
      .then(({ data, error }) => {
        if (error) console.error("Error loading drills:", error);
        setDrills((data || []) as Drill[]);
        setLoadingDrills(false);
      });
  }, [authLoading, userId]);

  // Load drill rounds (history)
  useEffect(() => {
    if (authLoading) return;
    supabase
      .from("sb_drill_rounds")
      .select("*, sb_drills(name)")
      .eq("user_id", userId)
      .order("date_played", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.error("Error loading rounds:", error);
        setRounds((data || []) as DrillRound[]);
      });
  }, [authLoading, userId]);

  // Load courses for on-course drills
  useEffect(() => {
    supabase
      .from("sb_courses")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setCourses((data || []) as Course[]);
      });
  }, []);

  // Load tee sets when course selected
  useEffect(() => {
    if (!selectedCourse) {
      setTeeSets([]);
      return;
    }
    supabase
      .from("sb_tee_sets")
      .select("*")
      .eq("course_id", selectedCourse)
      .order("total_yardage", { ascending: false })
      .then(({ data }) => {
        setTeeSets((data || []) as TeeSet[]);
      });
  }, [selectedCourse]);

  // ═══════════════════════════════════════════
  // HOME VIEW
  // ═══════════════════════════════════════════

  if (view === "home") {
    return (
      <div className="px-4 pt-4">
        <h1 className="text-2xl font-bold text-green-800 mb-4">Training</h1>

        <div className="space-y-3 mb-4">
          <button
            onClick={() => setView("on_course")}
            className="w-full bg-green-700 rounded-xl p-5 text-left shadow-sm active:scale-[0.98] transition-transform"
          >
            <p className="text-lg font-bold text-amber-400">⛳ On Course</p>
            <p className="text-sm text-white opacity-80 mt-1">
              Log drills while you play — select course, tee, and track shot-by-shot results
            </p>
          </button>

          <button
            onClick={() => setView("practice")}
            className="w-full bg-white rounded-xl p-5 text-left shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
          >
            <p className="text-lg font-bold text-green-700">🎯 Practice Drills</p>
            <p className="text-sm text-gray-500 mt-1">
              Log practice sessions with drills, track metrics over time
            </p>
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setView("add_drill")}
            className="flex-1 bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
          >
            <span className="text-sm font-semibold text-green-700">+ Add Drill</span>
          </button>
          <button
            onClick={() => setView("history")}
            className="flex-1 bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
          >
            <span className="text-sm font-semibold text-green-700">📋 History</span>
          </button>
        </div>

        {/* Quick stats */}
        {rounds.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Recent Training</h2>
            <div className="space-y-2">
              {rounds.slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-gray-900">
                      {(r as any).sb_drills?.name || "Drill"}
                    </span>
                    <span className="text-gray-400 ml-2">{formatDate(r.date_played)}</span>
                  </div>
                  <span className="text-gray-500">
                    {r.practice_type === "on_course" ? "⛳" : "🎯"}
                    {r.duration_minutes ? ` ${r.duration_minutes}m` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // ON COURSE VIEW
  // ═══════════════════════════════════════════

  if (view === "on_course") {
    const onCourseDrills = drills.filter(
      (d) => d.practice_type === "on_course" && d.category === onCourseCategory
    );

    return (
      <div className="px-4 pt-4">
        <button onClick={() => setView("home")} className="text-sm text-green-700 font-medium mb-3">
          ‹ Back
        </button>
        <h1 className="text-2xl font-bold text-green-800 mb-4">On Course Drills</h1>

        {/* Step 1: Course selection */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
          <h2 className="text-sm font-bold text-gray-700 mb-2">1. Select Course</h2>
          <select
            value={selectedCourse}
            onChange={(e) => { setSelectedCourse(e.target.value); setSelectedTee(""); }}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
          >
            <option value="">Choose a course...</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Step 2: Tee selection */}
        {selectedCourse && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
            <h2 className="text-sm font-bold text-gray-700 mb-2">2. Select Tee Set</h2>
            <select
              value={selectedTee}
              onChange={(e) => setSelectedTee(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
            >
              <option value="">Choose a tee...</option>
              {teeSets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.total_yardage} yds, {t.rating}/{t.slope})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Step 3: Category */}
        {selectedTee && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
              <h2 className="text-sm font-bold text-gray-700 mb-2">3. Category</h2>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setOnCourseCategory(c.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      onCourseCategory === c.key
                        ? "bg-green-700 text-amber-400"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 4: Drill list */}
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-gray-700">4. Choose a Drill</h2>
              {onCourseDrills.length === 0 ? (
                <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
                  <p className="text-sm text-gray-400">
                    No on-course drills in this category yet.
                  </p>
                  <button
                    onClick={() => setView("add_drill")}
                    className="text-xs text-green-700 font-medium mt-2"
                  >
                    + Create one
                  </button>
                </div>
              ) : (
                onCourseDrills.map((drill) => (
                  <button
                    key={drill.id}
                    onClick={() => {
                      setActiveDrill(drill);
                      setLogEntries([]);
                      setDrillNotes("");
                      setView("log_drill");
                    }}
                    className="block w-full text-left bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
                  >
                    <p className="font-semibold text-gray-900 text-sm">{drill.name}</p>
                    {drill.description && (
                      <p className="text-xs text-gray-500 mt-1">{drill.description}</p>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // PRACTICE VIEW
  // ═══════════════════════════════════════════

  if (view === "practice") {
    const practiceDrills = drills.filter(
      (d) => d.practice_type === "practice" && d.category === practiceCategory
    );

    return (
      <div className="px-4 pt-4">
        <button onClick={() => setView("home")} className="text-sm text-green-700 font-medium mb-3">
          ‹ Back
        </button>
        <h1 className="text-2xl font-bold text-green-800 mb-4">Practice Drills</h1>

        {/* Category selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setPracticeCategory(c.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                practiceCategory === c.key
                  ? "bg-green-700 text-amber-400"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        {/* Drill list */}
        <div className="space-y-2">
          {practiceDrills.length === 0 ? (
            <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
              <p className="text-sm text-gray-400">No practice drills in this category yet.</p>
              <button
                onClick={() => setView("add_drill")}
                className="text-xs text-green-700 font-medium mt-2"
              >
                + Create one
              </button>
            </div>
          ) : (
            practiceDrills.map((drill) => (
              <button
                key={drill.id}
                onClick={() => {
                  setActiveDrill(drill);
                  setLogEntries([]);
                  setDrillNotes("");
                  setDrillDuration("");
                  setMetricValue("");
                  setView("log_drill");
                }}
                className="block w-full text-left bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
              >
                <p className="font-semibold text-gray-900 text-sm">{drill.name}</p>
                {drill.description && (
                  <p className="text-xs text-gray-500 mt-1">{drill.description}</p>
                )}
                {drill.metric_type && (
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium">
                    {METRIC_TYPES.find((m) => m.value === drill.metric_type)?.label || drill.metric_type}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // LOG DRILL VIEW
  // ═══════════════════════════════════════════

  if (view === "log_drill" && activeDrill) {
    const isOnCourse = activeDrill.practice_type === "on_course";

    const addLogEntry = () => {
      if (isOnCourse) {
        setLogEntries([
          ...logEntries,
          { success: false, result: "", miss_detail: "", target_hit: "", hole_number: "", club: "", notes: "" },
        ]);
      }
    };

    const updateEntry = (idx: number, field: string, value: any) => {
      const updated = [...logEntries];
      updated[idx] = { ...updated[idx], [field]: value };
      setLogEntries(updated);
    };

    const removeEntry = (idx: number) => {
      setLogEntries(logEntries.filter((_, i) => i !== idx));
    };

    const saveDrillRound = async () => {
      const roundId = crypto.randomUUID();

      // Build metrics object for practice drills
      let metrics = null;
      if (!isOnCourse && activeDrill.metric_type) {
        const mv = parseFloat(metricValue);
        if (!isNaN(mv)) {
          metrics = { [activeDrill.metric_type]: mv };
        }
      }

      // Insert drill round
      const { error: roundErr } = await supabase.from("sb_drill_rounds").insert({
        id: roundId,
        drill_id: activeDrill.id,
        user_id: userId,
        practice_type: activeDrill.practice_type,
        course_id: isOnCourse ? selectedCourse : null,
        tee_set_id: isOnCourse ? selectedTee : null,
        duration_minutes: !isOnCourse ? parseInt(drillDuration) || null : null,
        category: activeDrill.category,
        notes: drillNotes || null,
        date_played: new Date().toISOString().split("T")[0],
        metrics,
      });

      if (roundErr) {
        console.error("Error saving drill round:", roundErr);
        alert("Error saving: " + roundErr.message);
        return;
      }

      // Insert drill logs (on-course entries)
      if (isOnCourse && logEntries.length > 0) {
        const logs = logEntries.map((e) => ({
          drill_round_id: roundId,
          hole_number: e.hole_number ? parseInt(e.hole_number) : null,
          success: e.success,
          result: e.result || null,
          miss_detail: e.miss_detail || null,
          target_hit: e.target_hit || null,
          club: e.club || null,
          notes: e.notes || null,
        }));
        const { error: logErr } = await supabase.from("sb_drill_logs").insert(logs);
        if (logErr) console.error("Error saving logs:", logErr);
      }

      // Reload rounds for history
      supabase
        .from("sb_drill_rounds")
        .select("*, sb_drills(name)")
        .eq("user_id", userId)
        .order("date_played", { ascending: false })
        .limit(50)
        .then(({ data }) => setRounds((data || []) as DrillRound[]));

      setView("home");
      setActiveDrill(null);
    };

    return (
      <div className="px-4 pt-4">
        <button onClick={() => setView("home")} className="text-sm text-green-700 font-medium mb-3">
          ‹ Cancel
        </button>

        <div className="bg-green-700 rounded-xl p-4 mb-4">
          <h1 className="text-lg font-bold text-amber-400">{activeDrill.name}</h1>
          {activeDrill.description && (
            <p className="text-sm text-white opacity-80 mt-1">{activeDrill.description}</p>
          )}
          <p className="text-xs text-white opacity-60 mt-2">
            {isOnCourse ? "⛳ On Course" : "🎯 Practice"} · {CATEGORIES.find((c) => c.key === activeDrill.category)?.label}
          </p>
        </div>

        {/* On-course: log attempts */}
        {isOnCourse && (
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-700">Attempts ({logEntries.length})</h2>
              <button
                onClick={addLogEntry}
                className="px-3 py-1.5 rounded-lg bg-amber-400 text-green-700 text-xs font-bold active:scale-[0.98] transition-transform"
              >
                + Add Attempt
              </button>
            </div>

            {logEntries.map((entry, idx) => (
              <div key={idx} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500">Attempt {idx + 1}</span>
                  <button onClick={() => removeEntry(idx)} className="text-xs text-red-500 font-medium">
                    Remove
                  </button>
                </div>

                {/* Hole number */}
                <input
                  type="number"
                  placeholder="Hole #"
                  value={entry.hole_number}
                  onChange={(e) => updateEntry(idx, "hole_number", e.target.value)}
                  className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                />

                {/* Success / Fail */}
                <div className="flex gap-2">
                  <button
                    onClick={() => updateEntry(idx, "success", true)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      entry.success === true
                        ? "bg-green-700 text-amber-400"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    ✓ Success
                  </button>
                  <button
                    onClick={() => updateEntry(idx, "success", false)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      entry.success === false
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    ✗ Failed
                  </button>
                </div>

                {/* Target hit */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Target</label>
                  <div className="flex gap-1.5">
                    {TARGET_HITS.map((t) => (
                      <button
                        key={t}
                        onClick={() => updateEntry(idx, "target_hit", t)}
                        className={`px-2 py-1 rounded-md text-[10px] font-medium ${
                          entry.target_hit === t
                            ? "bg-green-700 text-amber-400"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {t.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Miss direction */}
                {!entry.success && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Where did you miss?</label>
                    <div className="flex flex-wrap gap-1.5">
                      {MISS_DIRECTIONS.map((d) => (
                        <button
                          key={d}
                          onClick={() => updateEntry(idx, "miss_detail", d)}
                          className={`px-2 py-1 rounded-md text-[10px] font-medium ${
                            entry.miss_detail === d
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Club */}
                <input
                  type="text"
                  placeholder="Club used"
                  value={entry.club}
                  onChange={(e) => updateEntry(idx, "club", e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                />

                {/* Notes */}
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={entry.notes}
                  onChange={(e) => updateEntry(idx, "notes", e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                />
              </div>
            ))}

            {logEntries.length === 0 && (
              <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
                <p className="text-sm text-gray-400">Tap "Add Attempt" to log each shot</p>
              </div>
            )}
          </div>
        )}

        {/* Practice: duration + metrics */}
        {!isOnCourse && (
          <div className="space-y-3 mb-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <label className="text-xs font-semibold text-gray-700 block mb-1">Duration (minutes)</label>
              <input
                type="number"
                placeholder="30"
                value={drillDuration}
                onChange={(e) => setDrillDuration(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
              />
            </div>

            {activeDrill.metric_type && (
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  {METRIC_TYPES.find((m) => m.value === activeDrill.metric_type)?.label}
                </label>
                {activeDrill.metric_type === "success_attempts" ? (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Successes"
                      value={metricValue.split("/")[0] || ""}
                      onChange={(e) => {
                        const parts = metricValue.split("/");
                        setMetricValue(`${e.target.value}/${parts[1] || ""}`);
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                    />
                    <input
                      type="number"
                      placeholder="Attempts"
                      value={metricValue.split("/")[1] || ""}
                      onChange={(e) => {
                        const parts = metricValue.split("/");
                        setMetricValue(`${parts[0] || ""}/${e.target.value}`);
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                    />
                  </div>
                ) : (
                  <input
                    type="number"
                    placeholder="Value"
                    value={metricValue}
                    onChange={(e) => setMetricValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
          <label className="text-xs font-semibold text-gray-700 block mb-1">Notes</label>
          <textarea
            placeholder="How did it go? What did you notice?"
            value={drillNotes}
            onChange={(e) => setDrillNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600 resize-none"
          />
        </div>

        <button
          onClick={saveDrillRound}
          className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm shadow-sm active:scale-[0.98] transition-transform"
        >
          Save Drill
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // ADD DRILL VIEW
  // ═══════════════════════════════════════════

  if (view === "add_drill") {
    const [saving, setSaving] = useState(false);

    const saveDrill = async () => {
      if (!newDrill.name.trim()) {
        alert("Drill name is required");
        return;
      }
      if (!newDrill.description.trim()) {
        alert("Description is required");
        return;
      }
      setSaving(true);

      // Parse metric_value for success_attempts
      let metricsToSave = null;
      if (newDrill.metric_type === "success_attempts") {
        const [succ, att] = metricValue.split("/").map(Number);
        if (!isNaN(succ) && !isNaN(att)) {
          metricsToSave = { successes: succ, attempts: att };
        }
      } else if (newDrill.metric_type && metricValue) {
        const mv = parseFloat(metricValue);
        if (!isNaN(mv)) {
          metricsToSave = { [newDrill.metric_type]: mv };
        }
      }

      const { error } = await supabase.from("sb_drills").insert({
        user_id: userId,
        name: newDrill.name.trim(),
        description: newDrill.description.trim(),
        category: newDrill.category,
        metric_type: newDrill.metric_type,
        practice_type: newDrill.practice_type,
        is_shared: newDrill.is_shared,
        is_default: false,
        type: "score-based",
      });

      setSaving(false);
      if (error) {
        alert("Error: " + error.message);
        return;
      }

      // Reload drills
      supabase
        .from("sb_drills")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name")
        .then(({ data }) => setDrills((data || []) as Drill[]));

      setNewDrill({
        name: "",
        description: "",
        category: "putting",
        metric_type: null,
        practice_type: "practice",
        is_shared: true,
      });
      setMetricValue("");
      setView("home");
    };

    return (
      <div className="px-4 pt-4">
        <button onClick={() => setView("home")} className="text-sm text-green-700 font-medium mb-3">
          ‹ Back
        </button>
        <h1 className="text-2xl font-bold text-green-800 mb-4">Create Drill</h1>

        <div className="space-y-3">
          {/* Name */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <label className="text-xs font-semibold text-gray-700 block mb-1">Drill Name *</label>
            <input
              type="text"
              value={newDrill.name}
              onChange={(e) => setNewDrill({ ...newDrill, name: e.target.value })}
              placeholder="e.g., Cut Shot Approaches"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
              maxLength={80}
            />
          </div>

          {/* Practice type */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <label className="text-xs font-semibold text-gray-700 block mb-1">Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setNewDrill({ ...newDrill, practice_type: "practice" })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                  newDrill.practice_type === "practice"
                    ? "bg-green-700 text-amber-400"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                🎯 Practice
              </button>
              <button
                onClick={() => setNewDrill({ ...newDrill, practice_type: "on_course" })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                  newDrill.practice_type === "on_course"
                    ? "bg-green-700 text-amber-400"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                ⛳ On Course
              </button>
            </div>
          </div>

          {/* Category */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <label className="text-xs font-semibold text-gray-700 block mb-1">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setNewDrill({ ...newDrill, category: c.key })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                    newDrill.category === c.key
                      ? "bg-green-700 text-amber-400"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <label className="text-xs font-semibold text-gray-700 block mb-1">Description *</label>
            <textarea
              value={newDrill.description}
              onChange={(e) => setNewDrill({ ...newDrill, description: e.target.value })}
              placeholder="Describe the drill and what to track..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600 resize-none"
            />
          </div>

          {/* Metric type */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <label className="text-xs font-semibold text-gray-700 block mb-1">Metric (optional)</label>
            <select
              value={newDrill.metric_type || ""}
              onChange={(e) => setNewDrill({ ...newDrill, metric_type: (e.target.value || null) as MetricType })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
            >
              {METRIC_TYPES.map((m) => (
                <option key={String(m.value)} value={m.value || ""}>{m.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              How you'll evaluate this drill. Track progress over time.
            </p>
          </div>

          {/* Share to database */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newDrill.is_shared}
                onChange={(e) => setNewDrill({ ...newDrill, is_shared: e.target.checked })}
                className="w-5 h-5 rounded accent-green-700"
              />
              <span className="text-sm text-gray-700">Share to database (visible to all users)</span>
            </label>
          </div>

          {/* Save */}
          <button
            onClick={saveDrill}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-amber-400 text-green-700 font-bold text-sm shadow-sm active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Drill"}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // HISTORY VIEW
  // ═══════════════════════════════════════════

  if (view === "history") {
    return (
      <div className="px-4 pt-4">
        <button onClick={() => setView("home")} className="text-sm text-green-700 font-medium mb-3">
          ‹ Back
        </button>
        <h1 className="text-2xl font-bold text-green-800 mb-4">Drill History</h1>

        {rounds.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
            <p className="text-4xl mb-2">📋</p>
            <p className="text-sm font-semibold text-gray-700">No drill history yet</p>
            <p className="text-xs text-gray-400 mt-1">Log a drill to start tracking progress</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rounds.map((r) => {
              const drillName = (r as any).sb_drills?.name || "Unknown Drill";
              const cat = CATEGORIES.find((c) => c.key === r.category);
              return (
                <div key={r.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{drillName}</p>
                      <p className="text-xs text-gray-400">{formatDate(r.date_played)}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      {r.practice_type === "on_course" ? "⛳" : "🎯"} {cat?.label || r.category}
                    </span>
                  </div>

                  <div className="flex gap-4 text-xs text-gray-500">
                    {r.duration_minutes != null && (
                      <span>⏱ {r.duration_minutes} min</span>
                    )}
                    {r.metrics && Object.keys(r.metrics).length > 0 && (
                      <span>
                        📊 {Object.entries(r.metrics).map(([k, v]) => {
                          if (k === "success_attempts" && typeof v === "object") {
                            return `${v.successes}/${v.attempts}`;
                          }
                          return `${k.replace(/_/g, " ")}: ${v}`;
                        }).join(", ")}
                      </span>
                    )}
                  </div>

                  {r.notes && (
                    <p className="text-xs text-gray-500 italic mt-2">"{r.notes}"</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}
