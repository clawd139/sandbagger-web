"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Course } from "@/lib/constants";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const filtered = courses.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q) ||
      (c.state || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="px-4 pt-4">
      <h1 className="text-2xl font-bold text-green-800 mb-3">Courses</h1>
      <input
        type="search"
        placeholder="Search courses..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 mb-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-green-600"
      />
      {loading ? (
        <div className="text-center py-10 text-gray-800 text-sm">Loading courses...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="block bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{course.name}</h2>
                  <p className="text-sm text-gray-700">
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
          {filtered.length === 0 && (
            <div className="text-center py-10 text-gray-800 text-sm">No courses found</div>
          )}
        </div>
      )}
    </div>
  );
}
