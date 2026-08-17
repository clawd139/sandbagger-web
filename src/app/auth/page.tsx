"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import BagBuilder from "@/components/BagBuilder";

export default function AuthPage() {
  const { user, signIn, signUp, signOut, refreshProfile } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "signup") {
      const { error } = await signUp(username, password, displayName);
      if (error) setError(error);
    } else {
      const { error } = await signIn(username, password);
      if (error) setError(error);
    }
    setLoading(false);
  };

  // If logged in, show profile management
  if (user) {
    return (
      <div className="px-4 pt-4 pb-4">
        <h1 className="text-2xl font-bold text-green-800 mb-4">Profile</h1>

        {/* Profile info */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-xl">
              {(user.display_name || user.username)[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">
                {user.display_name || user.username}
              </p>
              <p className="text-sm text-gray-500">@{user.username}</p>
            </div>
          </div>
        </div>

        {/* Edit profile */}
        <ProfileEditor onSaved={refreshProfile} />

        {/* Bag builder */}
        <BagBuilder />

        {/* Share button */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
          <h2 className="text-sm font-bold text-gray-700 mb-2">Share Sandbagger</h2>
          <p className="text-xs text-gray-500 mb-3">
            Send this link to friends so they can create an account and you can follow each other&apos;s rounds.
          </p>
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: "Sandbagger — Golf Stats",
                  text: `Follow me on Sandbagger! @${user.username}`,
                  url: window.location.origin,
                });
              } else {
                navigator.clipboard.writeText(window.location.origin);
                alert("Link copied to clipboard!");
              }
            }}
            className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm shadow-sm active:scale-[0.98] transition-transform"
          >
            Share App Link
          </button>
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="w-full py-3 rounded-xl bg-gray-200 text-gray-700 font-semibold text-sm active:scale-[0.98] transition-transform"
        >
          Sign Out
        </button>
      </div>
    );
  }

  // Login / Signup form
  return (
    <div className="px-4 pt-8 max-w-md mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-green-800">Sandbagger</h1>
        <p className="text-sm text-gray-500 mt-1">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <input
            type="text"
            placeholder="Display name (e.g. Kathy Lemke)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-green-600"
            required
          />
        )}
        <input
          type="text"
          placeholder="Username (no spaces)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-green-600"
          required
          autoCapitalize="none"
          autoCorrect="off"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-green-600"
          required
          minLength={6}
        />
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm shadow-sm active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {loading ? "..." : mode === "login" ? "Log In" : "Create Account"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError("");
        }}
        className="w-full text-center text-sm text-green-700 font-medium mt-4"
      >
        {mode === "login"
          ? "Don't have an account? Sign up"
          : "Already have an account? Log in"}
      </button>
    </div>
  );
}

function ProfileEditor({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [handicap, setHandicap] = useState(user?.handicap?.toString() || "");
  const [homeCourse, setHomeCourse] = useState(user?.home_course || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { supabase } = await import("@/lib/supabase");
    await supabase.from("sb_profiles").update({
      display_name: displayName,
      username: username.toLowerCase().replace(/[^a-z0-9_]/g, ""),
      handicap: handicap ? parseFloat(handicap) : null,
      home_course: homeCourse || null,
      bio: bio || null,
    }).eq("id", user.id);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3 space-y-3">
      <h2 className="text-sm font-bold text-gray-700">Edit Profile</h2>
      <div>
        <label className="text-xs font-semibold text-gray-700 block mb-1">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-700 block mb-1">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-700 block mb-1">Handicap</label>
          <input
            type="number"
            step="0.1"
            value={handicap}
            onChange={(e) => setHandicap(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
            placeholder="—"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-700 block mb-1">Home Course</label>
          <input
            type="text"
            value={homeCourse}
            onChange={(e) => setHomeCourse(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
            placeholder="—"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-700 block mb-1">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600 resize-none"
          rows={2}
          placeholder="Tell other golfers about yourself..."
        />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2 rounded-lg bg-green-700 text-amber-400 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Profile"}
      </button>
    </div>
  );
}
