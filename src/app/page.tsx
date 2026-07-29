"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Course = {
  id: string;
  name: string;
  city: string;
  state: string;
  num_holes: number;
};

export default function Home() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("sb_courses")
      .select("*")
      .order("name")
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setCourses(data || []);
        setLoading(false);
      });
  }, []);

  // Register service worker for PWA
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  const filtered = courses.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q)
    );
  });

  return (
    <main className="flex-1 max-w-md mx-auto w-full px-4 pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-gray-50 pt-4 pb-3 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-green-800">Sandbagger</h1>
          <span className="text-xs text-gray-500">{courses.length} courses</span>
        </div>
        <input
          type="search"
          placeholder="Search courses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-green-600"
        />
      </div>

      {/* Course list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="text-gray-400 text-sm">Loading courses...</div>
        </div>
      ) : (
        <div className="space-y-2 pt-2">
          {filtered.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{course.name}</h2>
                  <p className="text-sm text-gray-500">
                    {course.city}, {course.state}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                  {course.num_holes} holes
                </span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              No courses found
            </div>
          )}
        </div>
      )}

      {/* Bottom nav placeholder */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 max-w-md mx-auto">
        <div className="flex justify-around items-center h-14">
          <button className="text-green-700 font-medium text-sm">Courses</button>
          <button className="text-gray-400 font-medium text-sm">Log Round</button>
          <button className="text-gray-400 font-medium text-sm">Stats</button>
        </div>
      </nav>
    </main>
  );
}
