"use client";

import { useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Course } from "@/lib/constants";

// Generate a UUID v4 (crypto.randomUUID if available, else fallback)
function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface HoleData {
  par: number;
  yardage: number;
}

interface TeeHoleData {
  yardage: number;
  par: number;
}

interface AddCourseModalProps {
  onClose: () => void;
  onCreated: (course: Course) => void;
}

export default function AddCourseModal({ onClose, onCreated }: AddCourseModalProps) {
  // Sub-steps: 1=course info, 2=holes (par+yardage), 3=tees
  const [subStep, setSubStep] = useState(1);

  // Course info
  const [courseName, setCourseName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [numHoles, setNumHoles] = useState(18);

  // Per-hole data
  const [holes, setHoles] = useState<HoleData[]>(
    Array.from({ length: 18 }, () => ({ par: 4, yardage: 0 }))
  );

  // Tee sets
  const [teeName, setTeeName] = useState("");
  const [teeColor, setTeeColor] = useState("White");
  const [teeRating, setTeeRating] = useState("");
  const [teeSlope, setTeeSlope] = useState("");
  const [usePerHoleYardages, setUsePerHoleYardages] = useState(false);
  const [teeYardages, setTeeYardages] = useState<TeeHoleData[]>(
    Array.from({ length: 18 }, () => ({ yardage: 0, par: 4 }))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateHole = (idx: number, field: keyof HoleData, value: number) => {
    setHoles((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)));
  };

  const updateTeeYardage = (idx: number, field: keyof TeeHoleData, value: number) => {
    setTeeYardages((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)));
  };

  // When numHoles changes, resize arrays
  const handleNumHolesChange = (n: number) => {
    setNumHoles(n);
    setHoles((prev) => {
      if (prev.length === n) return prev;
      if (n > prev.length) return [...prev, ...Array.from({ length: n - prev.length }, () => ({ par: 4, yardage: 0 }))];
      return prev.slice(0, n);
    });
    setTeeYardages((prev) => {
      if (prev.length === n) return prev;
      if (n > prev.length) return [...prev, ...Array.from({ length: n - prev.length }, () => ({ yardage: 0, par: 4 }))];
      return prev.slice(0, n);
    });
  };

  const totalPar = holes.slice(0, numHoles).reduce((s, h) => s + (h.par || 0), 0);
  const totalYardage = holes.slice(0, numHoles).reduce((s, h) => s + (h.yardage || 0), 0);
  const teeTotalYardage = usePerHoleYardages
    ? teeYardages.slice(0, numHoles).reduce((s, h) => s + (h.yardage || 0), 0)
    : totalYardage;
  const teeTotalPar = holes.slice(0, numHoles).reduce((s, h) => s + (h.par || 0), 0);

  const save = async () => {
    setError(null);
    if (!courseName.trim()) {
      setError("Course name is required");
      return;
    }
    if (holes.slice(0, numHoles).some((h) => h.par < 1 || h.par > 6)) {
      setError("Every hole needs a par between 1 and 6");
      return;
    }
    if (!teeName.trim()) {
      setError("Tee set name is required");
      return;
    }

    setSaving(true);
    try {
      const courseId = uuid();
      const teeSetId = uuid();

      // 1. Insert course
      const { error: cErr } = await supabase.from("sb_courses").insert({
        id: courseId,
        name: courseName.trim(),
        city: city.trim() || null,
        state: state.trim() || null,
        country: "US",
        num_holes: numHoles,
      });
      if (cErr) throw cErr;

      // 2. Insert holes (course-level)
      const holeRows = holes.slice(0, numHoles).map((h, i) => ({
        id: uuid(),
        course_id: courseId,
        hole_number: i + 1,
        par: h.par,
        distance_yards: h.yardage || null,
        shape: "straight",
        hazards: [],
        notes: "",
      }));
      const { error: hErr } = await supabase.from("sb_holes").insert(holeRows);
      if (hErr) throw hErr;

      // 3. Insert tee set
      const { error: tErr } = await supabase.from("sb_tee_sets").insert({
        id: teeSetId,
        course_id: courseId,
        color: teeColor.trim(),
        name: teeName.trim(),
        total_yardage: teeTotalYardage || 0,
        total_par: teeTotalPar,
        rating: teeRating ? parseFloat(teeRating) : null,
        slope: teeSlope ? parseInt(teeSlope) : null,
      });
      if (tErr) throw tErr;

      // 4. Insert tee holes (per-tee yardages)
      const teeHoleRows = holes.slice(0, numHoles).map((h, i) => ({
        id: uuid(),
        tee_set_id: teeSetId,
        hole_number: i + 1,
        yardage: usePerHoleYardages ? (teeYardages[i].yardage || 0) : (h.yardage || 0),
        par: h.par,
        handicap_index: 1, // default, user can edit later
      }));
      const { error: thErr } = await supabase.from("sb_tee_holes").insert(teeHoleRows);
      if (thErr) throw thErr;

      // Return the new course object
      const newCourse: Course = {
        id: courseId,
        name: courseName.trim(),
        city: city.trim() || null,
        state: state.trim() || null,
        country: "US",
        num_holes: numHoles,
      };
      onCreated(newCourse);
    } catch (e: any) {
      console.error("Add course error:", e);
      setError(e.message || "Failed to create course");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            {subStep > 1 && (
              <button
                type="button"
                onClick={() => setSubStep(subStep - 1)}
                className="text-green-700 text-sm"
              >
                ←
              </button>
            )}
            <h2 className="text-lg font-bold text-green-800">Add a Course</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-800 text-xl">
            ✕
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5 px-4 pt-3">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${subStep >= s ? "bg-green-700" : "bg-gray-200"}`}
            />
          ))}
        </div>

        <div className="p-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Sub-step 1: Course info */}
          {subStep === 1 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Course Name</label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g. Pine Valley Golf Club"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Pine Valley"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. NJ"
                    maxLength={3}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Number of Holes</label>
                <div className="flex gap-2">
                  {[9, 18].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleNumHolesChange(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                        numHoles === n ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {n} holes
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubStep(2)}
                disabled={!courseName.trim()}
                className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm disabled:opacity-40"
              >
                Next: Hole Details →
              </button>
            </div>
          )}

          {/* Sub-step 2: Per-hole par & yardage */}
          {subStep === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Enter par and yardage for each hole.
              </p>
              <div className="space-y-2">
                {holes.slice(0, numHoles).map((h, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2 border border-gray-100">
                    <span className="w-6 text-xs font-bold text-green-800 text-center">H{i + 1}</span>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-700 block">Par</label>
                      <div className="flex gap-1">
                        {[3, 4, 5, 6].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updateHole(i, "par", p)}
                            className={`flex-1 py-1.5 rounded text-xs font-bold ${
                              h.par === p ? "bg-green-700 text-amber-400" : "bg-white text-gray-800 border border-gray-200"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="w-20">
                      <label className="text-[10px] text-gray-700 block">Yards</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={h.yardage || ""}
                        onChange={(e) => updateHole(i, "yardage", parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm text-center font-bold text-green-800 focus:outline-none focus:border-green-600"
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-green-50 rounded-lg p-2 text-center text-sm">
                <span className="font-bold text-green-800">Par {totalPar}</span>
                <span className="text-gray-700"> · </span>
                <span className="font-bold text-green-800">{totalYardage.toLocaleString()} yds</span>
              </div>
              <button
                type="button"
                onClick={() => setSubStep(3)}
                className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm"
              >
                Next: Create Tees →
              </button>
            </div>
          )}

          {/* Sub-step 3: Tee set creation */}
          {subStep === 3 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-green-800">Create your own tees</p>
              <p className="text-xs text-gray-700">
                Name the tee set you played (or will play). Yardages default to the hole yardages you just entered — override them per-hole if your tee plays different lengths.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Tee Name</label>
                  <input
                    type="text"
                    value={teeName}
                    onChange={(e) => setTeeName(e.target.value)}
                    placeholder="e.g. Blue, White, Championship"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Color</label>
                  <select
                    value={teeColor}
                    onChange={(e) => setTeeColor(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600 bg-white"
                  >
                    {["Black", "Blue", "White", "Gold", "Red", "Green", "Silver", "Bronze"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Rating (optional)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={teeRating}
                    onChange={(e) => setTeeRating(e.target.value)}
                    placeholder="e.g. 71.2"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Slope (optional)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={teeSlope}
                    onChange={(e) => setTeeSlope(e.target.value)}
                    placeholder="e.g. 132"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                  />
                </div>
              </div>

              {/* Toggle: per-hole yardage override */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Per-hole yardages</p>
                  <p className="text-xs text-gray-700">Override yardages for this tee set</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUsePerHoleYardages(!usePerHoleYardages)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    usePerHoleYardages ? "bg-green-700" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${
                      usePerHoleYardages ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {usePerHoleYardages && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {teeYardages.slice(0, numHoles).map((th, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2 border border-gray-100">
                      <span className="w-6 text-xs font-bold text-green-800 text-center">H{i + 1}</span>
                      <span className="text-xs text-gray-700 w-8">Par {holes[i]?.par || 4}</span>
                      <div className="flex-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={th.yardage || ""}
                          onChange={(e) => updateTeeYardage(i, "yardage", parseInt(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm text-center font-bold text-green-800 focus:outline-none focus:border-green-600"
                          placeholder="0"
                        />
                      </div>
                      <span className="text-xs text-gray-700">yds</span>
                    </div>
                  ))}
                  <div className="bg-green-50 rounded-lg p-2 text-center text-sm">
                    <span className="font-bold text-green-800">{teeTotalYardage.toLocaleString()} yds</span>
                    <span className="text-gray-700"> · Par {teeTotalPar}</span>
                  </div>
                </div>
              )}

              {!usePerHoleYardages && (
                <div className="bg-green-50 rounded-lg p-2 text-center text-sm">
                  <span className="font-bold text-green-800">{teeTotalYardage.toLocaleString()} yds</span>
                  <span className="text-gray-700"> · Par {teeTotalPar}</span>
                </div>
              )}

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Course"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
