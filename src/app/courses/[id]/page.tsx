"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getTeeColor, isWhiteTee } from "@/lib/constants";
import type { Course, TeeSet, TeeHole, Hole } from "@/lib/constants";

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [course, setCourse] = useState<Course | null>(null);
  const [teeSets, setTeeSets] = useState<TeeSet[]>([]);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [teeHolesBySet, setTeeHolesBySet] = useState<Record<string, TeeHole[]>>({});
  const [selectedTeeId, setSelectedTeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [courseRes, teesRes, holesRes] = await Promise.all([
        supabase.from("sb_courses").select("*").eq("id", id).single(),
        supabase.from("sb_tee_sets").select("*").eq("course_id", id).order("total_yardage", { ascending: false }),
        supabase.from("sb_holes").select("*").eq("course_id", id).order("hole_number"),
      ]);

      setCourse(courseRes.data as Course);
      const tees = (teesRes.data || []) as TeeSet[];
      setTeeSets(tees);
      setHoles((holesRes.data || []) as Hole[]);

      // Load tee holes for all tee sets
      if (tees.length > 0) {
        const teeIds = tees.map((t) => t.id);
        const { data: thData } = await supabase
          .from("sb_tee_holes")
          .select("*")
          .in("tee_set_id", teeIds)
          .order("hole_number");

        const bySet: Record<string, TeeHole[]> = {};
        (thData || []).forEach((th) => {
          const t = th as TeeHole;
          if (!bySet[t.tee_set_id]) bySet[t.tee_set_id] = [];
          bySet[t.tee_set_id].push(t);
        });
        setTeeHolesBySet(bySet);

        // Auto-select longest tee as default
        if (tees.length > 0) setSelectedTeeId(tees[0].id);
      }

      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return <div className="px-4 pt-10 text-center text-gray-800 text-sm">Loading course...</div>;
  }

  if (!course) {
    return (
      <div className="px-4 pt-10 text-center">
        <p className="text-gray-800 text-sm">Course not found</p>
        <Link href="/courses" className="text-green-700 text-sm font-medium mt-2 inline-block">
          ← Back to Courses
        </Link>
      </div>
    );
  }

  const selectedTee = teeSets.find((t) => t.id === selectedTeeId);
  const selectedTeeHoles = selectedTeeId ? teeHolesBySet[selectedTeeId] || [] : [];

  // Get par for hole from tee holes or course holes
  const getPar = (holeNum: number): number => {
    const th = selectedTeeHoles.find((h) => h.hole_number === holeNum);
    if (th) return th.par;
    const h = holes.find((h) => h.hole_number === holeNum);
    return h?.par || 4;
  };

  const getYardage = (holeNum: number): number | null => {
    const th = selectedTeeHoles.find((h) => h.hole_number === holeNum);
    if (th) return th.yardage;
    const h = holes.find((h) => h.hole_number === holeNum);
    return h?.distance_yards || null;
  };

  const getHcp = (holeNum: number): number | null => {
    const th = selectedTeeHoles.find((h) => h.hole_number === holeNum);
    return th?.handicap_index || null;
  };

  const numHoles = selectedTeeHoles.length || holes.length || course.num_holes || 18;
  const holeNumbers = Array.from({ length: numHoles }, (_, i) => i + 1);

  const front9Yds = holeNumbers.slice(0, 9).reduce((s, n) => s + (getYardage(n) || 0), 0);
  const back9Yds = holeNumbers.slice(9).reduce((s, n) => s + (getYardage(n) || 0), 0);
  const totalYds = front9Yds + back9Yds;
  const front9Par = holeNumbers.slice(0, 9).reduce((s, n) => s + getPar(n), 0);
  const back9Par = holeNumbers.slice(9).reduce((s, n) => s + getPar(n), 0);
  const totalPar = front9Par + back9Par;

  return (
    <div className="px-4 pt-4 pb-4">
      {/* Back link */}
      <Link href="/courses" className="text-green-700 text-sm mb-2 inline-block">
        ← Courses
      </Link>

      {/* Course header */}
      <h1 className="text-xl font-bold text-gray-900">{course.name}</h1>
      <p className="text-sm text-gray-700 mb-3">
        {course.city}
        {course.state ? `, ${course.state}` : ""}
      </p>

      {/* Tee set selector */}
      {teeSets.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">Tee Sets</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {teeSets.map((tee) => {
              const color = getTeeColor(tee.color || tee.name);
              const isW = isWhiteTee(tee.color || tee.name);
              const isActive = selectedTeeId === tee.id;
              return (
                <button
                  key={tee.id}
                  onClick={() => setSelectedTeeId(tee.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
                    isActive ? "bg-green-700" : "bg-white border border-gray-200"
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color, border: isW ? "1px solid #ccc" : "none" }}
                  />
                  <span className={`text-xs font-medium ${isActive ? "text-white" : "text-gray-700"}`}>
                    {tee.name || tee.color}
                  </span>
                  <span className={`text-[10px] ${isActive ? "text-green-200" : "text-gray-800"}`}>
                    {(tee.total_yardage || 0).toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected tee info */}
      {selectedTee && (
        <div className="bg-green-700 rounded-xl p-3 mb-3 grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-amber-400">{totalYds.toLocaleString()}</p>
            <p className="text-[10px] text-white opacity-80">Yards</p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-400">{totalPar}</p>
            <p className="text-[10px] text-white opacity-80">Par</p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-400">{selectedTee.rating || "—"}</p>
            <p className="text-[10px] text-white opacity-80">Rating</p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-400">{selectedTee.slope || "—"}</p>
            <p className="text-[10px] text-white opacity-80">Slope</p>
          </div>
        </div>
      )}

      {/* Scorecard */}
      <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 mb-3">
        <h2 className="text-sm font-bold text-gray-700 mb-2">Scorecard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-green-700 text-white">
                <th className="px-2 py-2 text-center font-semibold sticky left-0 bg-green-700 z-10">Hole</th>
                {teeSets.length > 0 && <th className="px-2 py-2 text-center font-semibold">Hcp</th>}
                <th className="px-2 py-2 text-center font-semibold">Par</th>
                <th className="px-2 py-2 text-center font-semibold">Yds</th>
              </tr>
            </thead>
            <tbody>
              {/* Front 9 */}
              {holeNumbers.slice(0, 9).map((n) => (
                <tr key={n} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-center font-bold text-green-700 sticky left-0 bg-white z-10">{n}</td>
                  {teeSets.length > 0 && <td className="px-2 py-1.5 text-center text-gray-700">{getHcp(n) ?? "—"}</td>}
                  <td className="px-2 py-1.5 text-center text-gray-800">{getPar(n)}</td>
                  <td className="px-2 py-1.5 text-center text-gray-700">{getYardage(n) || "—"}</td>
                </tr>
              ))}
              {/* Out total */}
              <tr className="bg-gray-100 font-bold">
                <td className="px-2 py-1.5 text-center sticky left-0 bg-gray-100 z-10">OUT</td>
                {teeSets.length > 0 && <td className="px-2 py-1.5"></td>}
                <td className="px-2 py-1.5 text-center">{front9Par}</td>
                <td className="px-2 py-1.5 text-center">{front9Yds}</td>
              </tr>
              {/* Back 9 */}
              {holeNumbers.slice(9).map((n) => (
                <tr key={n} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-center font-bold text-green-700 sticky left-0 bg-white z-10">{n}</td>
                  {teeSets.length > 0 && <td className="px-2 py-1.5 text-center text-gray-700">{getHcp(n) ?? "—"}</td>}
                  <td className="px-2 py-1.5 text-center text-gray-800">{getPar(n)}</td>
                  <td className="px-2 py-1.5 text-center text-gray-700">{getYardage(n) || "—"}</td>
                </tr>
              ))}
              {/* In total */}
              {holeNumbers.length > 9 && (
                <tr className="bg-gray-100 font-bold">
                  <td className="px-2 py-1.5 text-center sticky left-0 bg-gray-100 z-10">IN</td>
                  {teeSets.length > 0 && <td className="px-2 py-1.5"></td>}
                  <td className="px-2 py-1.5 text-center">{back9Par}</td>
                  <td className="px-2 py-1.5 text-center">{back9Yds}</td>
                </tr>
              )}
              {/* Total */}
              <tr className="bg-green-700 text-white font-bold">
                <td className="px-2 py-1.5 text-center sticky left-0 bg-green-700 z-10">TOT</td>
                {teeSets.length > 0 && <td className="px-2 py-1.5"></td>}
                <td className="px-2 py-1.5 text-center">{totalPar}</td>
                <td className="px-2 py-1.5 text-center">{totalYds}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* All tee sets summary */}
      {teeSets.length > 1 && (
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
          <h2 className="text-sm font-bold text-gray-700 mb-2">All Tees</h2>
          <div className="space-y-1">
            {teeSets.map((tee) => {
              const color = getTeeColor(tee.color || tee.name);
              const isW = isWhiteTee(tee.color || tee.name);
              return (
                <div key={tee.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50">
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color, border: isW ? "1px solid #ccc" : "none" }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{tee.name || tee.color}</p>
                  </div>
                  <div className="text-xs text-gray-700 text-right">
                    {(tee.total_yardage || 0).toLocaleString()} yds · {tee.total_par} par
                    <br />
                    <span className="text-gray-800">{tee.rating}/{tee.slope}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log round button */}
      <Link
        href="/rounds/new"
        className="block mt-4 w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm text-center shadow-sm active:scale-[0.98] transition-transform"
      >
        Log a Round Here
      </Link>
    </div>
  );
}
