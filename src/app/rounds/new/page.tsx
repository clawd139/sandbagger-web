"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  USER_ID,
  parseNotes,
  getTeeColor,
  isWhiteTee,
} from "@/lib/constants";
import type { Course, Hole, TeeSet, TeeHole } from "@/lib/constants";

// Wrapper with Suspense for useSearchParams
export default function Page() {
  return (
    <Suspense fallback={<div className="px-4 pt-4 text-gray-400 text-sm">Loading...</div>}>
      <NewRoundPage />
    </Suspense>
  );
}

type HoleEntry = {
  score: number;
  putts: number;
  fairway_hit: boolean | null;
  fairway_miss_dir: string | null;
  gir: boolean;
  penalties: number;
  proximity: number | null;
};

const defaultHoleEntry = (): HoleEntry => ({
  score: 0,
  putts: 0,
  fairway_hit: null,
  fairway_miss_dir: null,
  gir: false,
  penalties: 0,
  proximity: null,
});

const WEATHER_OPTIONS = ["Sunny", "Partly Cloudy", "Overcast", "Light Rain", "Rain", "Windy", "Cold", "Hot & Humid"];
const ROUND_TYPES = [
  { key: "practice", label: "Practice 🏋️" },
  { key: "casual", label: "Casual ⛳" },
  { key: "tournament", label: "Tournament 🏆" },
];

function NewRoundPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [step, setStep] = useState(1);
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [teeSets, setTeeSets] = useState<TeeSet[]>([]);
  const [selectedTee, setSelectedTee] = useState<TeeSet | null>(null);
  const [teeHoles, setTeeHoles] = useState<TeeHole[]>([]);
  const [holeEntries, setHoleEntries] = useState<HoleEntry[]>([]);
  const [datePlayed, setDatePlayed] = useState(new Date().toISOString().split("T")[0]);
  const [weather, setWeather] = useState("");
  const [roundType, setRoundType] = useState<"practice" | "casual" | "tournament">("practice");
  const [visibility, setVisibility] = useState("private");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);

  // Load courses on mount
  useEffect(() => {
    supabase
      .from("sb_courses")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setCourses(data || []);
        setLoading(false);
      });
  }, []);

  // Load editing round if editId is provided
  useEffect(() => {
    if (!editId || courses.length === 0) return;
    (async () => {
      const { data: roundData } = await supabase
        .from("sb_rounds")
        .select("*, sb_courses(id, name, city, state, num_holes)")
        .eq("id", editId)
        .single();
      if (!roundData) return;

      setEditingRoundId(editId);
      const course = courses.find((c) => c.id === roundData.course_id) || (roundData.sb_courses as Course);
      if (course) {
        await selectCourse(course);
      }

      // Load hole scores
      const { data: scores } = await supabase
        .from("sb_hole_scores")
        .select("*")
        .eq("round_id", editId)
        .order("hole_number");

      if (scores && scores.length > 0) {
        const numH = scores.length;
        const entries = Array.from({ length: numH }, () => defaultHoleEntry());
        scores.forEach((hs: any) => {
          const idx = (hs.hole_number || 1) - 1;
          if (idx < 0 || idx >= entries.length) return;
          entries[idx].score = hs.score || 0;
          entries[idx].putts = hs.putts || 0;
          entries[idx].fairway_hit = hs.fairway_hit;
          entries[idx].fairway_miss_dir = hs.fairway_miss_dir || null;
          entries[idx].gir = hs.gir ?? false;
          entries[idx].penalties = hs.penalties || 0;
          entries[idx].proximity = hs.proximity ?? null;
        });
        setHoleEntries(entries);
      }

      // Restore round metadata
      const notes = parseNotes(roundData.notes);
      setDatePlayed(roundData.date_played || datePlayed);
      setWeather(roundData.weather || "");
      setRoundType(notes.round_type || "practice");
      setVisibility(roundData.visibility || "private");

      if (roundData.tee_set_id && teeSets.length > 0) {
        const tee = teeSets.find((t) => t.id === roundData.tee_set_id);
        if (tee) {
          setSelectedTee(tee);
          const { data: th } = await supabase
            .from("sb_tee_holes")
            .select("*")
            .eq("tee_set_id", tee.id)
            .order("hole_number");
          setTeeHoles(th || []);
        }
      }

      setStep(3); // Go straight to scorecard
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, courses]);

  const selectCourse = useCallback(async (course: Course) => {
    setSelectedCourse(course);
    const [holesRes, teesRes] = await Promise.all([
      supabase.from("sb_holes").select("*").eq("course_id", course.id).order("hole_number"),
      supabase.from("sb_tee_sets").select("*").eq("course_id", course.id).order("total_yardage", { ascending: false }),
    ]);
    setHoles(holesRes.data || []);
    setTeeSets(teesRes.data || []);
    const numH = holesRes.data?.length || course.num_holes || 18;
    setHoleEntries(Array.from({ length: numH }, () => defaultHoleEntry()));
    setSelectedTee(null);
    setTeeHoles([]);
    if ((teesRes.data || []).length > 0) setStep(2);
    else setStep(3);
  }, []);

  const selectTee = async (tee: TeeSet) => {
    setSelectedTee(tee);
    const { data } = await supabase
      .from("sb_tee_holes")
      .select("*")
      .eq("tee_set_id", tee.id)
      .order("hole_number");
    setTeeHoles(data || []);
    setStep(3);
  };

  const updateHoleEntry = (idx: number, field: keyof HoleEntry, value: any) => {
    setHoleEntries((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e;
        const updated = { ...e, [field]: value };
        // Reset fairway_miss_dir when fairway_hit is not false
        if (field === "fairway_hit" && value !== false) {
          updated.fairway_miss_dir = null;
        }
        return updated;
      })
    );
  };

  const filteredCourses = courses.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q);
  });

  // Get par for a hole
  const getPar = (idx: number): number => {
    return holes[idx]?.par || teeHoles.find((th) => th.hole_number === idx + 1)?.par || 4;
  };

  // Get yardage for a hole
  const getYardage = (idx: number): number | null => {
    return teeHoles.find((th) => th.hole_number === idx + 1)?.yardage || holes[idx]?.distance_yards || null;
  };

  const totalScore = holeEntries.reduce((s, e) => s + (e.score || 0), 0);
  const totalPutts = holeEntries.reduce((s, e) => s + (e.putts || 0), 0);
  const totalPar = holeEntries.reduce((s, _, i) => s + getPar(i), 0);
  const front9Score = holeEntries.slice(0, 9).reduce((s, e) => s + (e.score || 0), 0);
  const back9Score = holeEntries.slice(9).reduce((s, e) => s + (e.score || 0), 0);

  const saveRound = async () => {
    if (!selectedCourse) {
      alert("Please select a course first");
      return;
    }
    setSaving(true);
    try {
      const notesJson = JSON.stringify({
        round_type: roundType,
        tracking_mode: "basic",
        holes_played: Array.from({ length: holeEntries.length }, (_, i) => i + 1),
      });

      let roundId: string;

      if (editingRoundId) {
        // Update existing round
        const { error } = await supabase
          .from("sb_rounds")
          .update({
            course_id: selectedCourse.id,
            date_played: datePlayed,
            total_score: totalScore,
            weather,
            visibility,
            tee_set_id: selectedTee?.id || null,
            notes: notesJson,
          })
          .eq("id", editingRoundId);
        if (error) throw error;
        roundId = editingRoundId;
        // Delete old hole scores
        await supabase.from("sb_hole_scores").delete().eq("round_id", roundId);
      } else {
        // Insert new round
        const { data: round, error } = await supabase
          .from("sb_rounds")
          .insert({
            user_id: USER_ID,
            course_id: selectedCourse.id,
            date_played: datePlayed,
            total_score: totalScore,
            weather,
            wind: null,
            is_complete: true,
            visibility,
            tee_set_id: selectedTee?.id || null,
            notes: notesJson,
          })
          .select()
          .single();
        if (error) throw error;
        roundId = round.id;
      }

      // Insert hole scores
      const scoreInserts = holeEntries.map((e, i) => ({
        round_id: roundId,
        hole_id: holes[i]?.id || null,
        hole_number: i + 1,
        par: getPar(i),
        score: e.score,
        putts: e.putts,
        fairway_hit: e.fairway_hit,
        fairway_miss_dir: e.fairway_hit === false ? e.fairway_miss_dir : null,
        gir: e.gir,
        penalties: e.penalties,
        proximity: e.proximity,
      }));

      const { error: scoreError } = await supabase.from("sb_hole_scores").insert(scoreInserts);
      if (scoreError) {
        // Retry without proximity column if it doesn't exist
        if (scoreError.message.includes("proximity") || scoreError.message.includes("column")) {
          const fallbackInserts = scoreInserts.map(({ proximity, ...rest }) => rest);
          const { error: retryError } = await supabase.from("sb_hole_scores").insert(fallbackInserts);
          if (retryError) throw retryError;
        } else {
          throw scoreError;
        }
      }

      alert(editingRoundId ? `Round updated! Total: ${totalScore}` : `Round saved! Total: ${totalScore}`);
      router.push("/rounds");
    } catch (e: any) {
      console.error("Save round error:", e);
      alert(`Error saving round: ${e.message || JSON.stringify(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // ====== Step 1: Course Selection ======
  if (step === 1) {
    return (
      <div className="px-4 pt-4">
        <div className="flex items-center mb-3">
          <button onClick={() => router.back()} className="text-green-700 text-sm mr-2">
            ← Back
          </button>
          <h1 className="text-xl font-bold text-green-800 flex-1">New Round</h1>
        </div>
        <p className="text-sm text-gray-500 mb-3">Step 1: Select a course</p>
        <input
          type="search"
          placeholder="Search courses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 mb-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-green-600"
        />
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading courses...</div>
        ) : (
          <div className="space-y-2">
            {filteredCourses.map((course) => (
              <button
                key={course.id}
                onClick={() => selectCourse(course)}
                className="w-full text-left bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
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
              </button>
            ))}
            {filteredCourses.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">No courses found</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ====== Step 2: Tee Set Selection ======
  if (step === 2) {
    return (
      <div className="px-4 pt-4">
        <div className="flex items-center mb-3">
          <button onClick={() => setStep(1)} className="text-green-700 text-sm mr-2">
            ← Back
          </button>
          <h1 className="text-xl font-bold text-green-800 flex-1">Select Tee</h1>
        </div>
        <p className="text-sm text-gray-500 mb-3">{selectedCourse?.name}</p>
        <div className="space-y-2">
          {teeSets.map((tee) => {
            const color = getTeeColor(tee.color || tee.name);
            const isWhite = isWhiteTee(tee.color || tee.name);
            return (
              <button
                key={tee.id}
                onClick={() => selectTee(tee)}
                className="w-full flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
              >
                <span
                  className="w-6 h-6 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: color,
                    border: isWhite ? "2px solid #e0e0d8" : "none",
                  }}
                />
                <div className="flex-1 text-left">
                  <p className="font-semibold text-gray-900">{tee.name || tee.color}</p>
                  <p className="text-xs text-gray-500">
                    {(tee.total_yardage || 0).toLocaleString()} yds · Par {tee.total_par} · {tee.rating}/{tee.slope}
                  </p>
                </div>
                <span className="text-gray-400">›</span>
              </button>
            );
          })}
          <button
            onClick={() => setStep(3)}
            className="w-full bg-gray-100 rounded-xl p-4 text-sm font-medium text-gray-600 active:scale-[0.98] transition-transform"
          >
            Skip — No tee set
          </button>
        </div>
      </div>
    );
  }

  // ====== Step 3: Scorecard Entry ======
  return (
    <div className="px-4 pt-4">
      <div className="flex items-center mb-2">
        <button onClick={() => setStep(2)} className="text-green-700 text-sm mr-2">
          ← Back
        </button>
        <h1 className="text-xl font-bold text-green-800 flex-1">
          {editingRoundId ? "Edit Round" : "Scorecard"}
        </h1>
      </div>
      <p className="text-sm text-gray-500 mb-2">
        {selectedCourse?.name}
        {selectedTee && ` · ${selectedTee.name || selectedTee.color} tees`}
      </p>

      {/* Score Summary Bar */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 bg-green-700 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-amber-400">{totalScore}</p>
          <p className="text-[10px] text-white opacity-80">Total</p>
        </div>
        <div className="flex-1 bg-green-700 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-amber-400">{totalPar}</p>
          <p className="text-[10px] text-white opacity-80">Par</p>
        </div>
        <div className="flex-1 bg-green-700 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-amber-400">
            {totalScore - totalPar > 0 ? "+" : ""}
            {totalScore - totalPar}
          </p>
          <p className="text-[10px] text-white opacity-80">To Par</p>
        </div>
        <div className="flex-1 bg-green-700 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-amber-400">{totalPutts}</p>
          <p className="text-[10px] text-white opacity-80">Putts</p>
        </div>
      </div>

      {/* Scorecard Table */}
      <div className="overflow-x-auto mb-3">
        <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-green-700 text-white">
              <th className="px-1 py-2 text-center font-semibold sticky left-0 bg-green-700 z-10">Hole</th>
              <th className="px-1 py-2 text-center font-semibold">Par</th>
              <th className="px-1 py-2 text-center font-semibold">Yds</th>
              <th className="px-1 py-2 text-center font-semibold">Score</th>
              <th className="px-1 py-2 text-center font-semibold">Putts</th>
              <th className="px-1 py-2 text-center font-semibold">FW</th>
              <th className="px-1 py-2 text-center font-semibold">GIR</th>
              <th className="px-1 py-2 text-center font-semibold">Prox</th>
            </tr>
          </thead>
          <tbody>
            {/* Front 9 */}
            {holeEntries.slice(0, 9).map((entry, idx) => (
              <HoleRow
                key={idx}
                holeNum={idx + 1}
                entry={entry}
                par={getPar(idx)}
                yardage={getYardage(idx)}
                onUpdate={(field, value) => updateHoleEntry(idx, field, value)}
              />
            ))}
            {/* Front 9 total */}
            <tr className="bg-gray-100 font-bold">
              <td className="px-1 py-1.5 text-center sticky left-0 bg-gray-100 z-10">OUT</td>
              <td className="px-1 py-1.5 text-center" colSpan={2}>
                {holeEntries.slice(0, 9).reduce((s, _, i) => s + getPar(i), 0)}
              </td>
              <td className="px-1 py-1.5 text-center text-green-700">{front9Score}</td>
              <td className="px-1 py-1.5 text-center" colSpan={3}></td>
            </tr>
            {/* Back 9 */}
            {holeEntries.slice(9).map((entry, idx) => (
              <HoleRow
                key={idx + 9}
                holeNum={idx + 10}
                entry={entry}
                par={getPar(idx + 9)}
                yardage={getYardage(idx + 9)}
                onUpdate={(field, value) => updateHoleEntry(idx + 9, field, value)}
              />
            ))}
            {holeEntries.length > 9 && (
              <tr className="bg-gray-100 font-bold">
                <td className="px-1 py-1.5 text-center sticky left-0 bg-gray-100 z-10">IN</td>
                <td className="px-1 py-1.5 text-center" colSpan={2}>
                  {holeEntries.slice(9).reduce((s, _, i) => s + getPar(i + 9), 0)}
                </td>
                <td className="px-1 py-1.5 text-center text-green-700">{back9Score}</td>
                <td className="px-1 py-1.5 text-center" colSpan={3}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Round Details */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3 space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1">Date Played</label>
          <input
            type="date"
            value={datePlayed}
            onChange={(e) => setDatePlayed(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1">Round Type</label>
          <div className="flex gap-2">
            {ROUND_TYPES.map((rt) => (
              <button
                key={rt.key}
                onClick={() => setRoundType(rt.key as any)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  roundType === rt.key
                    ? "bg-green-700 text-amber-400"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {rt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1">Weather (optional)</label>
          <select
            value={weather}
            onChange={(e) => setWeather(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
          >
            <option value="">— Select —</option>
            {WEATHER_OPTIONS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1">Visibility</label>
          <div className="flex gap-2">
            <button
              onClick={() => setVisibility("private")}
              className={`flex-1 py-2 rounded-lg text-xs font-medium ${
                visibility === "private" ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-600"
              }`}
            >
              Private
            </button>
            <button
              onClick={() => setVisibility("public")}
              className={`flex-1 py-2 rounded-lg text-xs font-medium ${
                visibility === "public" ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-600"
              }`}
            >
              Public
            </button>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={saveRound}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm shadow-sm active:scale-[0.98] transition-transform disabled:opacity-50 mb-4"
      >
        {saving ? "Saving..." : editingRoundId ? "Update Round" : "Save Round"}
      </button>
    </div>
  );
}

// Hole row component for the scorecard
function HoleRow({
  holeNum,
  entry,
  par,
  yardage,
  onUpdate,
}: {
  holeNum: number;
  entry: HoleEntry;
  par: number;
  yardage: number | null;
  onUpdate: (field: keyof HoleEntry, value: any) => void;
}) {
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-1 py-1.5 text-center font-bold text-green-700 sticky left-0 bg-white z-10">
        {holeNum}
      </td>
      <td className="px-1 py-1.5 text-center text-gray-600">{par}</td>
      <td className="px-1 py-1.5 text-center text-gray-400 text-[10px]">{yardage || "—"}</td>
      <td className="px-1 py-1.5 text-center">
        <input
          type="number"
          inputMode="numeric"
          value={entry.score || ""}
          onChange={(e) => onUpdate("score", parseInt(e.target.value) || 0)}
          className="w-10 px-1 py-1 text-center rounded border border-gray-200 text-xs focus:outline-none focus:border-green-600"
          placeholder="—"
        />
      </td>
      <td className="px-1 py-1.5 text-center">
        <input
          type="number"
          inputMode="numeric"
          value={entry.putts || ""}
          onChange={(e) => onUpdate("putts", parseInt(e.target.value) || 0)}
          className="w-10 px-1 py-1 text-center rounded border border-gray-200 text-xs focus:outline-none focus:border-green-600"
          placeholder="—"
        />
      </td>
      <td className="px-1 py-1.5 text-center">
        <FairwaySelector
          value={entry.fairway_hit}
          missDir={entry.fairway_miss_dir}
          par={par}
          onChange={(hit, dir) => {
            onUpdate("fairway_hit", hit);
            onUpdate("fairway_miss_dir", dir);
          }}
        />
      </td>
      <td className="px-1 py-1.5 text-center">
        <button
          onClick={() => onUpdate("gir", !entry.gir)}
          className={`w-6 h-6 rounded text-xs font-bold ${
            entry.gir ? "bg-green-600 text-white" : "bg-gray-200 text-gray-400"
          }`}
        >
          {entry.gir ? "✓" : "—"}
        </button>
      </td>
      <td className="px-1 py-1.5 text-center">
        <input
          type="number"
          inputMode="numeric"
          value={entry.proximity ?? ""}
          onChange={(e) => onUpdate("proximity", e.target.value ? parseFloat(e.target.value) : null)}
          className="w-10 px-1 py-1 text-center rounded border border-gray-200 text-xs focus:outline-none focus:border-green-600"
          placeholder="—"
        />
      </td>
    </tr>
  );
}

// Fairway selector: for par 4/5, show L/C/R/miss buttons
function FairwaySelector({
  value,
  missDir,
  par,
  onChange,
}: {
  value: boolean | null;
  missDir: string | null;
  par: number;
  onChange: (hit: boolean | null, dir: string | null) => void;
}) {
  // Par 3s don't have fairways
  if (par === 3) return <span className="text-gray-300 text-[10px]">—</span>;

  // Cycle through: null → true (hit) → false+L → false+C → false+R → null
  const cycle = () => {
    if (value === null) onChange(true, null);
    else if (value === true) onChange(false, "L");
    else if (missDir === "L") onChange(false, "C");
    else if (missDir === "C") onChange(false, "R");
    else if (missDir === "R") onChange(null, null);
    else onChange(false, "L");
  };

  let label = "—";
  let bgColor = "bg-gray-200 text-gray-400";
  if (value === true) {
    label = "✓";
    bgColor = "bg-green-600 text-white";
  } else if (value === false) {
    label = missDir || "✗";
    bgColor = "bg-amber-500 text-white";
  }

  return (
    <button onClick={cycle} className={`w-7 h-6 rounded text-[10px] font-bold ${bgColor}`}>
      {label}
    </button>
  );
}
