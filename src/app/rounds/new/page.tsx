"use client";

import { useEffect, useState, useCallback, Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  USER_ID,
  parseNotes,
  getTeeColor,
  isWhiteTee,
} from "@/lib/constants";
import type { Course, Hole, TeeSet, TeeHole } from "@/lib/constants";
import PinScanner, { type PinData } from "@/components/PinScanner";

// Wrapper with Suspense for useSearchParams (Next.js 16 requirement)
export default function Page() {
  return (
    <Suspense fallback={<div className="px-4 pt-4 text-gray-800 text-sm">Loading...</div>}>
      <NewRoundPage />
    </Suspense>
  );
}

// ============ Constants ============

const CLUBS = [
  "Driver", "3W", "5W", "7W", "2H", "3H", "4H", "5H",
  "3i", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "GW", "SW", "LW", "Putter",
];
const CHIP_CLUBS = ["Putter", "PW", "GW", "SW", "LW", "9i", "8i", "7i"];
const SHOT_SHAPES = ["Straight", "Draw", "Fade", "Punch", "Flop", "Knockdown", "High", "Low"];
const RESULT_LIES = ["Fairway", "Rough", "Fescue", "Bunker", "Green", "Fringe", "Water", "Hazard", "OB", "Drop", "Trees", "Cart Path"];
const MISS_DIRECTIONS = ["Left", "Right", "Short", "Long", "On Target"];
const LIE_SLOPES = ["Uphill", "Downhill", "Sidehill (Toward)", "Sidehill (Away)", "Flat"];
const SHOT_BREAKS = ["Left-to-Right", "Right-to-Left", "Straight", "Double Break"];
const SHOT_SLOPES = ["Uphill", "Downhill", "Flat"];
const INTENTIONS = [
  { key: "hit_fairway", label: "Hit Fairway" },
  { key: "lay_up", label: "Lay Up" },
  { key: "hit_green", label: "Hit Green" },
  { key: "recovery", label: "Recovery" },
  { key: "punch_out", label: "Punch Out" },
  { key: "chip_pitch", label: "Chip/Pitch" },
];
const PUTT_BREAKS = ["Left-to-Right", "Right-to-Left", "Straight", "Double Break"];
const PUTT_SLOPES = ["Uphill", "Downhill", "Flat"];
const PUTT_RESULTS_3X3 = [
  ["miss-long-left", "miss-long", "miss-long-right"],
  ["miss-left", "made", "miss-right"],
  ["miss-short-left", "miss-short", "miss-short-right"],
];
const LIE_TYPES = ["Tee", "Fairway", "Rough", "Bunker", "Green", "Fringe", "Trees"];
const WEATHER_OPTIONS = ["Sunny", "Partly Cloudy", "Overcast", "Light Rain", "Rain", "Windy", "Cold", "Hot & Humid"];
const WIND_OPTIONS = ["Calm", "5-10 mph", "10-15 mph", "15-20 mph", "20+ mph"];
const GRASS_TYPES = ["Bermuda", "Bentgrass", "Poa Annua", "Zoysia", "Ryegrass", "Fescue", "Paspalum", "Mixed"];
const ROUGH_THICKNESS = ["Thin", "Medium", "Thick", "Very Thick"];
const FEELINGS = ["Confident", "Nervous", "Frustrated", "Neutral", "Excited", "Anxious", "Calm"];
const REACTIONS = ["Positive", "Negative", "Neutral"];
const EXECUTE_OPTIONS = ["Yes", "No", "Partial"];
const EMOTIONS_INFLUENCED_OPTIONS = ["Yes", "No", "Somewhat"];
const REACTION_MATCHED_OPTIONS = ["Yes", "No", "Overreacted", "Underreacted"];

const GRID_3X3 = [
  ["back-left", "back-center", "back-right"],
  ["mid-left", "center", "mid-right"],
  ["front-left", "front-center", "front-right"],
];
const GRID_5X5_KEYS = [
  ["miss-long-left", "miss-long", "miss-long-right"],
  ["miss-left", "on-back-left", "on-back-center", "on-back-right", "miss-right"],
  ["miss-left", "on-mid-left", "on-center", "on-mid-right", "miss-right"],
  ["miss-left", "on-front-left", "on-front-center", "on-front-right", "miss-right"],
  ["miss-short-left", "miss-short", "miss-short-right"],
];

const ROUND_TYPES = [
  { key: "practice", label: "Practice 🏋️" },
  { key: "casual", label: "Casual ⛳" },
  { key: "tournament", label: "Tournament 🏆" },
];

type TrackingMode = "skip" | "basic" | "advanced" | "strategy" | "mental";

const TRACKING_MODES: { key: TrackingMode; emoji: string; label: string; desc: string }[] = [
  { key: "skip", emoji: "⚡", label: "Skip Stats", desc: "Just enter your total score" },
  { key: "basic", emoji: "⚡", label: "Basic", desc: "Score, putts, fairways & GIR" },
  { key: "advanced", emoji: "🎯", label: "Advanced", desc: "Per-shot club, intention & result" },
  { key: "strategy", emoji: "🧠", label: "Strategy", desc: "Intention & execution tracking" },
  { key: "mental", emoji: "🧘", label: "Mental", desc: "Psychology & emotional awareness" },
];

const PIN_LABELS: Record<string, string> = {
  "back-left": "Back L", "back-center": "Back C", "back-right": "Back R",
  "mid-left": "Mid L", "center": "Center", "mid-right": "Mid R",
  "front-left": "Front L", "front-center": "Front C", "front-right": "Front R",
};
const PUTT_RESULT_LABELS: Record<string, string> = {
  made: "Made",
  "miss-long-left": "Long L", "miss-long": "Long", "miss-long-right": "Long R",
  "miss-left": "Left", "miss-right": "Right",
  "miss-short-left": "Short L", "miss-short": "Short", "miss-short-right": "Short R",
};
const GREEN_POS_LABELS: Record<string, string> = {
  "miss-long-left": "L-L", "miss-long": "Long", "miss-long-right": "L-R",
  "miss-left": "Left",
  "on-back-left": "BK-L", "on-back-center": "BK-C", "on-back-right": "BK-R",
  "on-mid-left": "MD-L", "on-center": "Ctr", "on-mid-right": "MD-R",
  "on-front-left": "FT-L", "on-front-center": "FT-C", "on-front-right": "FT-R",
  "miss-right": "Right",
  "miss-short-left": "S-L", "miss-short": "Short", "miss-short-right": "S-R",
};

// ============ Types ============

interface ShotData {
  shot_number: number;
  club: string;
  shot_shape: string;
  intention: string;
  layup_target_distance?: string;
  pin_depth_front?: string;
  pin_side_dist?: string;
  pin_side_dir?: string;
  pin_center_offset?: string;
  pin_green_depth?: string;
  pin_mode?: "precise" | "general";
  pin_quadrant?: string;
  aim_point?: string;
  result_lie: string;
  miss_direction: string;
  green_position?: string;
  distance_to_hole?: string;
  is_putt?: boolean;
  putt_distance?: string;
  putt_break?: string;
  putt_slope?: string;
  putt_result?: string;
  putt_distance_remaining?: string;
  putt_hit_line?: string;
  putt_line_miss?: string;
  putt_hit_speed?: string;
  putt_speed_miss?: string;
  approach_distance?: string;
  shot_lie_slope?: string;
  shot_break?: string;
  shot_slope?: string;
  is_penalty?: boolean;
}

interface StrategyData {
  lie_type: string;
  distance: string;
  intention: string;
  executed: string;
  notes: string;
}

interface MentalData {
  pre_feeling: string;
  difficulty_rating: number;
  emotions_influenced: string;
  commitment_level: number;
  executed_plan: string;
  post_reaction: string;
  reaction_matched: string;
}

interface HoleEntry {
  score: number;
  putts: number;
  fairway_hit: boolean | null;
  fairway_miss_dir: string | null;
  gir: boolean;
  penalties: number;
  wedge_and_in: number | null;
  custom_yardage: number | null;
  shots: ShotData[];
  strategy?: StrategyData;
  mental?: MentalData;
}

const defaultShot = (): ShotData => ({
  shot_number: 0,
  club: "",
  shot_shape: "",
  intention: "",
  result_lie: "",
  miss_direction: "",
});

const defaultStrategy = (): StrategyData => ({
  lie_type: "",
  distance: "",
  intention: "",
  executed: "",
  notes: "",
});

const defaultMental = (): MentalData => ({
  pre_feeling: "",
  difficulty_rating: 0,
  emotions_influenced: "",
  commitment_level: 0,
  executed_plan: "",
  post_reaction: "",
  reaction_matched: "",
});

const defaultHoleEntry = (): HoleEntry => ({
  score: 0,
  putts: 0,
  fairway_hit: null,
  fairway_miss_dir: null,
  gir: false,
  penalties: 0,
  wedge_and_in: null,
  custom_yardage: null,
  shots: [],
});

// Keep shot count synced with score, accounting for penalties (advanced mode only)
function syncShots(shots: ShotData[], score: number): ShotData[] {
  const penaltyCount = shots.filter((s) => s.is_penalty).length;
  const targetCount = Math.max(0, score - penaltyCount);
  let arr = [...shots];
  while (arr.length < targetCount) arr.push(defaultShot());
  if (arr.length > targetCount) arr = arr.slice(0, targetCount);
  return arr.map((s, i) => ({ ...s, shot_number: i + 1 }));
}

// ============ Small UI primitives ============

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-xs text-gray-700 block mb-1">{label}</span>
      {children}
    </div>
  );
}

function PillRow({
  options,
  value,
  onChange,
}: {
  options: (string | { value: string; label: string })[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const v = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
              value === v ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Counter({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-gray-700 flex-1">{label}</span>}
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-full bg-gray-200 text-gray-700 font-bold text-base leading-none flex items-center justify-center"
      >
        −
      </button>
      <span className="w-8 text-center font-bold text-green-800">{value || 0}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-full bg-gray-200 text-gray-700 font-bold text-base leading-none flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}

function ScaleButtons({
  value,
  onChange,
  max,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  label?: string;
}) {
  return (
    <div>
      {label && <span className="text-xs text-gray-700 block mb-1">{label}</span>}
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 py-1.5 rounded text-[11px] font-bold transition-colors ${
              value === n ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function YesNo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={() => onChange("Yes")}
        className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${
          value === "Yes" ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
        }`}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange("No")}
        className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${
          value === "No" ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
        }`}
      >
        No
      </button>
    </div>
  );
}

function Grid3x3({
  keys,
  value,
  onChange,
  labels,
}: {
  keys: string[][];
  value: string;
  onChange: (v: string) => void;
  labels: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {keys.flat().map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`py-2 rounded text-[10px] font-medium transition-colors ${
            value === k ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
          }`}
        >
          {labels[k] || k}
        </button>
      ))}
    </div>
  );
}

function GreenPositionGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      {GRID_5X5_KEYS.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1">
          {row.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k)}
              className={`w-11 h-9 rounded text-[8px] font-medium transition-colors ${
                value === k ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
              }`}
            >
              {GREEN_POS_LABELS[k] || k}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function SummaryBar({
  totalScore,
  totalPar,
  totalPutts,
  showPutts = true,
}: {
  totalScore: number;
  totalPar: number;
  totalPutts: number;
  showPutts?: boolean;
}) {
  const diff = totalScore - totalPar;
  return (
    <div className="flex gap-2 mb-3">
      <div className="flex-1 bg-green-700 rounded-lg p-2 text-center">
        <p className="text-lg font-bold text-amber-400">{totalScore || 0}</p>
        <p className="text-[10px] text-white opacity-80">Total</p>
      </div>
      <div className="flex-1 bg-green-700 rounded-lg p-2 text-center">
        <p className="text-lg font-bold text-amber-400">{totalPar}</p>
        <p className="text-[10px] text-white opacity-80">Par</p>
      </div>
      <div className="flex-1 bg-green-700 rounded-lg p-2 text-center">
        <p className="text-lg font-bold text-amber-400">
          {diff > 0 ? "+" : ""}
          {diff}
        </p>
        <p className="text-[10px] text-white opacity-80">To Par</p>
      </div>
      {showPutts && (
        <div className="flex-1 bg-green-700 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-amber-400">{totalPutts}</p>
          <p className="text-[10px] text-white opacity-80">Putts</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-700">{label}</span>
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

// ============ Basic hole fields (shared across basic/advanced/strategy/mental) ============

function BasicHoleFields({
  entry,
  trackWI,
  onUpdate,
}: {
  entry: HoleEntry;
  trackWI: boolean;
  onUpdate: (field: keyof HoleEntry, value: any) => void;
}) {
  return (
    <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Counter label="Score" value={entry.score} min={1} onChange={(v) => onUpdate("score", v)} />
        <Counter label="Putts" value={entry.putts} onChange={(v) => onUpdate("putts", v)} />
      </div>

      <Field label="Fairway Hit">
        <div className="flex gap-1.5">
          {(["Yes", "No", "N/A"] as const).map((o) => {
            const v = o === "Yes" ? true : o === "No" ? false : null;
            const active = entry.fairway_hit === v;
            const color = o === "Yes" && active
              ? "bg-green-700 text-amber-400"
              : o === "No" && active
                ? "bg-amber-500 text-white"
                : o === "N/A" && active
                  ? "bg-gray-300 text-gray-700"
                  : "bg-gray-100 text-gray-800";
            return (
              <button
                key={o}
                type="button"
                onClick={() => onUpdate("fairway_hit", v)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${color}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      </Field>

      {entry.fairway_hit === false && (
        <Field label="Fairway Miss Direction">
          <div className="flex gap-1.5">
            {[
              { v: "L", l: "Left" },
              { v: "R", l: "Right" },
            ].map((d) => (
              <button
                key={d.v}
                type="button"
                onClick={() => onUpdate("fairway_miss_dir", d.v)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${
                  entry.fairway_miss_dir === d.v ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
                }`}
              >
                {d.l}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="GIR">
        <div className="flex gap-1.5">
          {(["Yes", "No"] as const).map((o) => {
            const v = o === "Yes";
            return (
              <button
                key={o}
                type="button"
                onClick={() => onUpdate("gir", v)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${
                  entry.gir === v ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      </Field>

      <Counter label="Penalties" value={entry.penalties} onChange={(v) => onUpdate("penalties", v)} />

      {trackWI && (
        <Counter label="Wedge & In" value={entry.wedge_and_in || 0} onChange={(v) => onUpdate("wedge_and_in", v)} />
      )}
    </div>
  );
}

// ============ Advanced: per-shot card ============

function ShotCard({
  shot,
  shotIdx,
  displayShotNum,
  totalShots,
  putts,
  onUpdate,
}: {
  shot: ShotData;
  shotIdx: number;
  displayShotNum: number;
  totalShots: number;
  putts: number;
  onUpdate: (field: keyof ShotData, value: any) => void;
}) {
  const isPutt = shotIdx >= totalShots - putts;
  const isApproach = shotIdx > 0;
  const hitGreen = shot.intention === "hit_green";
  const isChipPitch = shot.intention === "chip_pitch";
  const onGreen = shot.result_lie === "Green" || shot.result_lie === "Fringe";
  const missed = !!shot.putt_result && shot.putt_result !== "made";

  // Club list: if chip/pitch, show chip clubs (includes Putter first). Otherwise full bag.
  const clubList = isChipPitch ? CHIP_CLUBS : CLUBS;

  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-green-800">
          Shot {displayShotNum}
          {isPutt ? " · Putt" : " · Full"}
        </span>
      </div>

      {isPutt ? (
        <div className="space-y-2">
          <Field label="Putt Distance (feet)">
            <input
              type="number"
              inputMode="numeric"
              value={shot.putt_distance || ""}
              onChange={(e) => onUpdate("putt_distance", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
              placeholder="e.g. 12"
            />
          </Field>
          <Field label="Putt Break">
            <PillRow options={PUTT_BREAKS} value={shot.putt_break || ""} onChange={(v) => onUpdate("putt_break", v)} />
          </Field>
          <Field label="Putt Slope">
            <PillRow options={PUTT_SLOPES} value={shot.putt_slope || ""} onChange={(v) => onUpdate("putt_slope", v)} />
          </Field>
          <Field label="Hit Line?">
            <YesNo value={shot.putt_hit_line || ""} onChange={(v) => onUpdate("putt_hit_line", v)} />
          </Field>
          {shot.putt_hit_line === "No" && (
            <Field label="Line Miss">
              <PillRow
                options={["Pull", "Push"]}
                value={shot.putt_line_miss || ""}
                onChange={(v) => onUpdate("putt_line_miss", v)}
              />
            </Field>
          )}
          <Field label="Hit Speed?">
            <YesNo value={shot.putt_hit_speed || ""} onChange={(v) => onUpdate("putt_hit_speed", v)} />
          </Field>
          {shot.putt_hit_speed === "No" && (
            <Field label="Speed Miss">
              <PillRow
                options={["Hard", "Soft"]}
                value={shot.putt_speed_miss || ""}
                onChange={(v) => onUpdate("putt_speed_miss", v)}
              />
            </Field>
          )}
          <Field label="Putt Result">
            <Grid3x3
              keys={PUTT_RESULTS_3X3}
              value={shot.putt_result || ""}
              onChange={(v) => onUpdate("putt_result", v)}
              labels={PUTT_RESULT_LABELS}
            />
          </Field>
          {missed && (
            <Field label="Distance Remaining (feet)">
              <input
                type="number"
                inputMode="numeric"
                value={shot.putt_distance_remaining || ""}
                onChange={(e) => onUpdate("putt_distance_remaining", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                placeholder="e.g. 2"
              />
            </Field>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Field label="Club">
            <PillRow options={clubList} value={shot.club || ""} onChange={(v) => onUpdate("club", v)} />
          </Field>
          {isApproach && (
            <Field label="Approach Distance (yards)">
              <input
                type="number"
                inputMode="numeric"
                value={shot.approach_distance || ""}
                onChange={(e) => onUpdate("approach_distance", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                placeholder="e.g. 145"
              />
            </Field>
          )}
          <Field label="Intention">
            <PillRow
              options={INTENTIONS.map((i) => ({ value: i.key, label: i.label }))}
              value={shot.intention || ""}
              onChange={(v) => onUpdate("intention", v)}
            />
          </Field>
          {hitGreen && (
            <div className="bg-green-50 rounded-lg p-2 border border-green-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-green-800">Pin Position</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdate("pin_mode", "precise")}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${shot.pin_mode !== "general" ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"}`}
                  >
                    Precise
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate("pin_mode", "general")}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${shot.pin_mode === "general" ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"}`}
                  >
                    General
                  </button>
                </div>
              </div>

              {shot.pin_mode === "general" ? (
                <Grid3x3
                  keys={GRID_3X3}
                  value={shot.pin_quadrant || ""}
                  onChange={(v) => onUpdate("pin_quadrant", v)}
                  labels={PIN_LABELS}
                />
              ) : (
                <>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Field label="From center (paces)">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={shot.pin_center_offset?.replace(/[+-]/, "") || ""}
                          onChange={(e) => {
                            const sign = shot.pin_center_offset?.match(/^[+-]/)?.[0] || "-";
                            onUpdate("pin_center_offset", sign + e.target.value);
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                          placeholder="e.g. 4"
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Up/Back">
                        <PillRow
                          options={["-", "+"]}
                          value={shot.pin_center_offset?.match(/^[+-]/)?.[0] || "-"}
                          onChange={(v) => {
                            const num = shot.pin_center_offset?.replace(/[+-]/, "") || "";
                            onUpdate("pin_center_offset", v + num);
                          }}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Field label="From side (paces)">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={shot.pin_side_dist || ""}
                          onChange={(e) => onUpdate("pin_side_dist", e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                          placeholder="e.g. 8"
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Side">
                        <PillRow
                          options={["L", "R"]}
                          value={shot.pin_side_dir || ""}
                          onChange={(v) => onUpdate("pin_side_dir", v)}
                        />
                      </Field>
                    </div>
                  </div>
                  <Field label="On from front (paces)">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={shot.pin_depth_front || ""}
                      onChange={(e) => onUpdate("pin_depth_front", e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                      placeholder="e.g. 32"
                    />
                  </Field>
                  <Field label="Green depth (optional)">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={shot.pin_green_depth || ""}
                      onChange={(e) => onUpdate("pin_green_depth", e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                      placeholder="e.g. 38"
                    />
                  </Field>
                </>
              )}
            </div>
          )}
          {shot.intention === "lay_up" && (
            <Field label="Layup Target Distance (yards)">
              <input
                type="number"
                inputMode="numeric"
                value={shot.layup_target_distance || ""}
                onChange={(e) => onUpdate("layup_target_distance", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
                placeholder="e.g. 80"
              />
            </Field>
          )}
          {isChipPitch && (
            <div className="bg-amber-50 rounded-lg p-2 border border-amber-200 space-y-2">
              <span className="text-[11px] font-bold text-amber-800 block">Lie Conditions</span>
              <Field label="Lie Slope">
                <PillRow options={LIE_SLOPES} value={shot.shot_lie_slope || ""} onChange={(v) => onUpdate("shot_lie_slope", v)} />
              </Field>
              <Field label="Shot Break">
                <PillRow options={SHOT_BREAKS} value={shot.shot_break || ""} onChange={(v) => onUpdate("shot_break", v)} />
              </Field>
              <Field label="Shot Slope">
                <PillRow options={SHOT_SLOPES} value={shot.shot_slope || ""} onChange={(v) => onUpdate("shot_slope", v)} />
              </Field>
            </div>
          )}
          <Field label="Result Lie">
            <PillRow options={RESULT_LIES} value={shot.result_lie || ""} onChange={(v) => onUpdate("result_lie", v)} />
          </Field>
          {["Water", "Hazard", "OB"].includes(shot.result_lie) && (
            <div className="bg-red-50 rounded-lg p-2 border border-red-200">
              <button
                type="button"
                onClick={() => onUpdate("is_penalty", !shot.is_penalty)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold ${
                  shot.is_penalty ? "bg-red-600 text-white" : "bg-white text-red-600 border border-red-300"
                }`}
              >
                <span>Penalty Stroke</span>
                <span>{shot.is_penalty ? "ON" : "OFF"}</span>
              </button>
              {shot.is_penalty && (
                <p className="text-[10px] text-red-500 mt-1">
                  Next shot distance won&apos;t auto-fill. Enter the actual distance from where you&apos;re dropping.
                </p>
              )}
            </div>
          )}
          <Field label={`Distance to Hole (${hitGreen && onGreen ? "feet" : "yards"})`}>
            <input
              type="number"
              inputMode="numeric"
              value={shot.distance_to_hole || ""}
              onChange={(e) => onUpdate("distance_to_hole", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
              placeholder="e.g. 18"
            />
          </Field>
          <Field label="Miss Direction">
            <PillRow
              options={MISS_DIRECTIONS}
              value={shot.miss_direction || ""}
              onChange={(v) => onUpdate("miss_direction", v)}
            />
          </Field>
          {(hitGreen || onGreen) && (
            <Field label="Green Position">
              <GreenPositionGrid value={shot.green_position || ""} onChange={(v) => onUpdate("green_position", v)} />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

// ============ Strategy section ============

function StrategySection({
  data,
  onChange,
}: {
  data: StrategyData;
  onChange: (field: keyof StrategyData, value: any) => void;
}) {
  return (
    <div className="bg-purple-50 rounded-xl p-3 border border-purple-200 space-y-2">
      <span className="text-xs font-bold text-purple-800 block mb-1">🧠 Strategy</span>
      <Field label="Lie Type">
        <PillRow options={LIE_TYPES} value={data.lie_type} onChange={(v) => onChange("lie_type", v)} />
      </Field>
      <Field label="Distance (yards)">
        <input
          type="number"
          inputMode="numeric"
          value={data.distance}
          onChange={(e) => onChange("distance", e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-600"
          placeholder="e.g. 150"
        />
      </Field>
      <Field label="Intention — What were you trying to do?">
        <textarea
          value={data.intention}
          onChange={(e) => onChange("intention", e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-600"
          rows={2}
          placeholder="e.g. Fade around the tree to the right pin"
        />
      </Field>
      <Field label="Executed">
        <PillRow options={EXECUTE_OPTIONS} value={data.executed} onChange={(v) => onChange("executed", v)} />
      </Field>
      <Field label="Notes (optional)">
        <textarea
          value={data.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-600"
          rows={2}
          placeholder="Any extra context..."
        />
      </Field>
    </div>
  );
}

// ============ Mental section (collapsible) ============

function MentalSection({
  data,
  onChange,
}: {
  data: MentalData;
  onChange: (field: keyof MentalData, value: any) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-indigo-50 rounded-xl border border-indigo-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3"
      >
        <span className="text-xs font-bold text-indigo-800">🧘 Mental</span>
        <span className="text-indigo-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="p-3 pt-0 space-y-2">
          <span className="text-[11px] font-semibold text-indigo-700 block">Pre-Shot</span>
          <Field label="Pre Feeling">
            <PillRow options={FEELINGS} value={data.pre_feeling} onChange={(v) => onChange("pre_feeling", v)} />
          </Field>
          <ScaleButtons
            label="Difficulty Rating"
            max={5}
            value={data.difficulty_rating}
            onChange={(v) => onChange("difficulty_rating", v)}
          />
          <Field label="Emotions Influenced">
            <PillRow
              options={EMOTIONS_INFLUENCED_OPTIONS}
              value={data.emotions_influenced}
              onChange={(v) => onChange("emotions_influenced", v)}
            />
          </Field>
          <ScaleButtons
            label="Commitment Level"
            max={5}
            value={data.commitment_level}
            onChange={(v) => onChange("commitment_level", v)}
          />
          <span className="text-[11px] font-semibold text-indigo-700 block pt-1">Post-Shot</span>
          <Field label="Executed Plan">
            <PillRow options={EXECUTE_OPTIONS} value={data.executed_plan} onChange={(v) => onChange("executed_plan", v)} />
          </Field>
          <Field label="Post Reaction">
            <PillRow options={REACTIONS} value={data.post_reaction} onChange={(v) => onChange("post_reaction", v)} />
          </Field>
          <Field label="Reaction Matched">
            <PillRow
              options={REACTION_MATCHED_OPTIONS}
              value={data.reaction_matched}
              onChange={(v) => onChange("reaction_matched", v)}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

// ============ Main page component ============

function NewRoundPage() {
  const { user, loading: authLoading } = useAuth();
  const activeUserId = user?.id || USER_ID;
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
  const [currentHole, setCurrentHole] = useState(0);

  // Round settings
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("basic");
  const [trackWedgeAndIn, setTrackWedgeAndIn] = useState(false);
  const [datePlayed, setDatePlayed] = useState(new Date().toISOString().split("T")[0]);
  const [weather, setWeather] = useState("");
  const [wind, setWind] = useState("");
  const [roundType, setRoundType] = useState<"practice" | "casual" | "tournament">("practice");
  const [visibility, setVisibility] = useState("private");
  const [grassType, setGrassType] = useState("");
  const [greenFirmness, setGreenFirmness] = useState(0);
  const [greenSpeed, setGreenSpeed] = useState(0);
  const [roughThickness, setRoughThickness] = useState("");
  const [scannedPins, setScannedPins] = useState<PinData[]>([]);
  const [showPinScanner, setShowPinScanner] = useState(false);

  // Skip mode total
  const [totalScoreSkip, setTotalScoreSkip] = useState(0);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);

  // Load courses on mount (guarded by auth loading)
  useEffect(() => {
    if (authLoading) return;
    supabase
      .from("sb_courses")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setCourses(data || []);
        setLoading(false);
      });
  }, [activeUserId, authLoading]);

  // Load editing round if editId is provided
  useEffect(() => {
    if (authLoading) return;
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
      let loadedHoles: Hole[] = [];
      if (course) {
        const res = await selectCourse(course);
        loadedHoles = res.holes;
      }

      const notes = parseNotes(roundData.notes);
      setDatePlayed(roundData.date_played || datePlayed);
      setWeather(roundData.weather || "");
      setWind(roundData.wind || "");
      setRoundType(notes.round_type || "practice");
      setVisibility(roundData.visibility || "private");
      setTrackingMode((notes.tracking_mode as TrackingMode) || "basic");
      setTrackWedgeAndIn(!!notes.track_wedge_and_in);
      setGreenFirmness(notes.green_firmness ?? 0);
      setGreenSpeed(notes.green_speed ?? 0);
      setGrassType(notes.grass_type || "");
      setRoughThickness(notes.rough_thickness || "");

      // Restore tee set
      if (roundData.tee_set_id) {
        const { data: tee } = await supabase
          .from("sb_tee_sets")
          .select("*")
          .eq("id", roundData.tee_set_id)
          .single();
        if (tee) {
          setSelectedTee(tee as TeeSet);
          const { data: th } = await supabase
            .from("sb_tee_holes")
            .select("*")
            .eq("tee_set_id", tee.id)
            .order("hole_number");
          setTeeHoles((th || []) as TeeHole[]);
        }
      }

      if (notes.tracking_mode === "skip") {
        setTotalScoreSkip(roundData.total_score || 0);
        setStep(4);
        return;
      }

      // Load hole scores
      const { data: scores } = await supabase
        .from("sb_hole_scores")
        .select("*")
        .eq("round_id", editId)
        .order("hole_number");

      const numH = loadedHoles.length || course?.num_holes || (scores?.length || 18);
      const entries: HoleEntry[] = Array.from({ length: numH }, () => defaultHoleEntry());
      (scores || []).forEach((hs: any) => {
        const idx = (hs.hole_number || 1) - 1;
        if (idx < 0 || idx >= entries.length) return;
        entries[idx].score = hs.score || 0;
        entries[idx].putts = hs.putts || 0;
        entries[idx].fairway_hit = hs.fairway_hit;
        entries[idx].fairway_miss_dir = hs.fairway_miss_dir || null;
        entries[idx].gir = hs.gir ?? false;
        entries[idx].penalties = hs.penalties || 0;
        entries[idx].wedge_and_in = hs.wedge_and_in ?? null;

        let hn: any = null;
        if (hs.notes) {
          try {
            hn = JSON.parse(hs.notes);
          } catch {
            hn = null;
          }
        }
        if (hn?.mode === "advanced" && Array.isArray(hn.shots)) {
          entries[idx].shots = hn.shots.map((s: any) => ({ ...defaultShot(), ...s }));
        } else if (hn?.mode === "strategy" && hn.data) {
          entries[idx].strategy = { ...defaultStrategy(), ...hn.data };
        } else if (hn?.mode === "mental" && hn.data) {
          entries[idx].mental = { ...defaultMental(), ...hn.data };
        }
      });
      setHoleEntries(entries);
      setStep(4);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, courses, authLoading]);

  const selectCourse = useCallback(async (course: Course) => {
    setSelectedCourse(course);
    const [holesRes, teesRes] = await Promise.all([
      supabase.from("sb_holes").select("*").eq("course_id", course.id).order("hole_number"),
      supabase.from("sb_tee_sets").select("*").eq("course_id", course.id).order("total_yardage", { ascending: false }),
    ]);
    const loadedHoles = (holesRes.data || []) as Hole[];
    const loadedTees = (teesRes.data || []) as TeeSet[];
    setHoles(loadedHoles);
    setTeeSets(loadedTees);
    const numH = loadedHoles.length || course.num_holes || 18;
    setHoleEntries(Array.from({ length: numH }, () => defaultHoleEntry()));
    setSelectedTee(null);
    setTeeHoles([]);
    if (loadedTees.length > 0) setStep(2);
    else setStep(3);
    return { holes: loadedHoles, teeSets: loadedTees };
  }, []);

  const selectTee = async (tee: TeeSet) => {
    setSelectedTee(tee);
    const { data } = await supabase
      .from("sb_tee_holes")
      .select("*")
      .eq("tee_set_id", tee.id)
      .order("hole_number");
    setTeeHoles((data || []) as TeeHole[]);
    setStep(3);
  };

  const updateHoleEntry = (idx: number, field: keyof HoleEntry, value: any) => {
    setHoleEntries((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e;
        const updated: HoleEntry = { ...e, [field]: value };
        if (field === "fairway_hit" && value !== false) {
          updated.fairway_miss_dir = null;
        }
        if (field === "score" && trackingMode === "advanced") {
          updated.shots = syncShots(updated.shots, value);
        }
        return updated;
      })
    );
  };

  const updateShot = (holeIdx: number, shotIdx: number, field: keyof ShotData, value: any) => {
    setHoleEntries((prev) =>
      prev.map((e, i) => {
        if (i !== holeIdx) return e;
        let shots = e.shots.map((s, si) => (si === shotIdx ? { ...s, [field]: value } : s));
        const currentShot = shots[shotIdx];
        const isHazard = ["Water", "Hazard", "OB"].includes(currentShot?.result_lie || "");
        const hasPenalty = !!currentShot?.is_penalty;

        // Auto-populate next shot's distance from this shot's distance_to_hole
        // Skip if penalty stroke taken (next shot is from a different position)
        if (field === "distance_to_hole" && shotIdx + 1 < shots.length && !hasPenalty) {
          const nextIsPutt = shotIdx + 1 >= shots.length - e.putts;
          shots[shotIdx + 1] = {
            ...shots[shotIdx + 1],
            [nextIsPutt ? "putt_distance" : "approach_distance"]: value,
          };
        }

        // Auto-populate pin position from scanned pins when intention changes to hit_green
        if (field === "intention" && value === "hit_green" && currentShot) {
          const pin = scannedPins.find((p) => p.hole === holeIdx + 1);
          if (pin) {
            shots[shotIdx] = {
              ...shots[shotIdx],
              pin_depth_front: pin.front || shots[shotIdx].pin_depth_front,
              pin_side_dist: pin.side || shots[shotIdx].pin_side_dist,
              pin_side_dir: pin.sideDir || shots[shotIdx].pin_side_dir,
              pin_center_offset: pin.center || shots[shotIdx].pin_center_offset,
              pin_green_depth: pin.depth || shots[shotIdx].pin_green_depth,
            };
          }
        }

        // Auto-populate next putt's distance from this putt's distance_remaining
        if (field === "putt_distance_remaining" && shotIdx + 1 < shots.length) {
          const nextIsPutt = shotIdx + 1 >= shots.length - e.putts;
          if (nextIsPutt) {
            shots[shotIdx + 1] = {
              ...shots[shotIdx + 1],
              putt_distance: value,
            };
          }
        }

        // When penalty is toggled on, clear the next shot's auto-populated distance
        if (field === "is_penalty" && value === true && shotIdx + 1 < shots.length) {
          const nextIsPutt = shotIdx + 1 >= shots.length - e.putts;
          shots[shotIdx + 1] = {
            ...shots[shotIdx + 1],
            [nextIsPutt ? "putt_distance" : "approach_distance"]: "",
          };
        }

        // When result_lie changes to a hazard and penalty is set, clear next shot's distance
        if (field === "result_lie" && isHazard && currentShot?.is_penalty && shotIdx + 1 < shots.length) {
          const nextIsPutt = shotIdx + 1 >= shots.length - e.putts;
          shots[shotIdx + 1] = {
            ...shots[shotIdx + 1],
            [nextIsPutt ? "putt_distance" : "approach_distance"]: "",
          };
        }

        // When is_penalty is toggled, re-sync shot count (penalty = virtual stroke, not a logged shot)
        if (field === "is_penalty") {
          const penaltyCount = shots.filter((s) => s.is_penalty).length;
          const targetCount = Math.max(0, e.score - penaltyCount);
          if (shots.length > targetCount) {
            shots = shots.slice(0, targetCount);
          } else {
            while (shots.length < targetCount) shots.push(defaultShot());
          }
        }

        // Auto-sync penalties field from is_penalty flags
        const penaltyCount = shots.filter((s) => s.is_penalty).length;

        return { ...e, shots, penalties: penaltyCount };
      })
    );
  };

  const updateStrategy = (idx: number, field: keyof StrategyData, value: any) => {
    setHoleEntries((prev) =>
      prev.map((e, i) =>
        i !== idx ? e : { ...e, strategy: { ...(e.strategy || defaultStrategy()), [field]: value } }
      )
    );
  };

  const updateMental = (idx: number, field: keyof MentalData, value: any) => {
    setHoleEntries((prev) =>
      prev.map((e, i) =>
        i !== idx ? e : { ...e, mental: { ...(e.mental || defaultMental()), [field]: value } }
      )
    );
  };

  const filteredCourses = courses.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q);
  });

  const getPar = (idx: number): number => {
    return holes[idx]?.par || teeHoles.find((th) => th.hole_number === idx + 1)?.par || 4;
  };

  const getYardage = (idx: number): number | null => {
    const entry = holeEntries[idx];
    if (entry?.custom_yardage != null) return entry.custom_yardage;
    return (
      teeHoles.find((th) => th.hole_number === idx + 1)?.yardage ||
      holes[idx]?.distance_yards ||
      null
    );
  };

  const totalScore = trackingMode === "skip" ? totalScoreSkip || 0 : holeEntries.reduce((s, e) => s + (e.score || 0), 0);
  const totalPutts = holeEntries.reduce((s, e) => s + (e.putts || 0), 0);
  const totalPar = holeEntries.reduce((s, _, i) => s + getPar(i), 0);

  const saveRound = async () => {
    if (!selectedCourse) {
      alert("Please select a course first");
      return;
    }
    setSaving(true);
    try {
      const holesPlayed =
        trackingMode === "skip" ? [] : Array.from({ length: holeEntries.length }, (_, i) => i + 1);

      const notesJson = JSON.stringify({
        tracking_mode: trackingMode,
        holes_played: holesPlayed,
        track_wedge_and_in: trackWedgeAndIn,
        round_type: roundType,
        green_firmness: greenFirmness || null,
        green_speed: greenSpeed || null,
        grass_type: grassType || null,
        rough_thickness: roughThickness || null,
      });

      let roundId: string;

      if (editingRoundId) {
        const { error } = await supabase
          .from("sb_rounds")
          .update({
            course_id: selectedCourse.id,
            date_played: datePlayed,
            total_score: totalScore,
            weather,
            wind,
            visibility,
            tee_set_id: selectedTee?.id || null,
            notes: notesJson,
          })
          .eq("id", editingRoundId);
        if (error) throw error;
        roundId = editingRoundId;
        await supabase.from("sb_hole_scores").delete().eq("round_id", roundId);
      } else {
        const { data: round, error } = await supabase
          .from("sb_rounds")
          .insert({
            user_id: activeUserId,
            course_id: selectedCourse.id,
            date_played: datePlayed,
            total_score: totalScore,
            weather,
            wind,
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

      // Skip mode: no per-hole rows
      if (trackingMode !== "skip") {
        const scoreInserts = holeEntries.map((e, i) => {
          // Per-hole notes JSON
          let holeNotes: string | null = null;
          if (trackingMode === "advanced") {
            const shotsWithPutt = e.shots.map((s, si) => {
              const penaltiesBefore = e.shots
                .slice(0, si)
                .filter((sh) => sh.is_penalty).length;
              return {
                ...s,
                shot_number: si + 1 + penaltiesBefore,
                is_putt: si >= e.shots.length - e.putts,
              };
            });
            holeNotes = JSON.stringify({ mode: "advanced", shots: shotsWithPutt });
          } else if (trackingMode === "strategy" && e.strategy) {
            holeNotes = JSON.stringify({ mode: "strategy", data: e.strategy });
          } else if (trackingMode === "mental" && e.mental) {
            holeNotes = JSON.stringify({ mode: "mental", data: e.mental });
          }

          // Derive proximity (GIR proximity) from first shot that landed on the green
          let proximity: number | null = null;
          if (trackingMode === "advanced") {
            const greenShot = e.shots.find((s) => s.result_lie === "Green");
            if (greenShot?.distance_to_hole) {
              const parsed = parseFloat(greenShot.distance_to_hole);
              if (!Number.isNaN(parsed)) proximity = parsed;
            }
          }

          return {
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
            wedge_and_in: trackWedgeAndIn ? e.wedge_and_in : null,
            proximity,
            notes: holeNotes,
          };
        });

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
        <p className="text-sm text-gray-700 mb-3">Step 1: Select a course</p>
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
            {filteredCourses.map((course) => (
              <button
                key={course.id}
                onClick={() => selectCourse(course)}
                className="w-full text-left bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{course.name}</h3>
                    <p className="text-sm text-gray-700">
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
              <div className="text-center py-10 text-gray-800 text-sm">No courses found</div>
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
        <p className="text-sm text-gray-700 mb-3">{selectedCourse?.name}</p>
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
                  <p className="text-xs text-gray-700">
                    {(tee.total_yardage || 0).toLocaleString()} yds · Par {tee.total_par} · {tee.rating}/{tee.slope}
                  </p>
                </div>
                <span className="text-gray-800">›</span>
              </button>
            );
          })}
          <button
            onClick={() => setStep(3)}
            className="w-full bg-gray-100 rounded-xl p-4 text-sm font-medium text-gray-800 active:scale-[0.98] transition-transform"
          >
            Skip — No tee set
          </button>
        </div>
      </div>
    );
  }

  // ====== Step 3: Round Settings ======
  if (step === 3) {
    return (
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center mb-2">
          <button
            onClick={() => (teeSets.length > 0 ? setStep(2) : setStep(1))}
            className="text-green-700 text-sm mr-2"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-green-800 flex-1">Round Settings</h1>
        </div>
        <p className="text-sm text-gray-700 mb-3">
          {selectedCourse?.name}
          {selectedTee && ` · ${selectedTee.name || selectedTee.color} tees`}
        </p>

        {/* Tracking Mode */}
        <span className="text-xs font-semibold text-gray-700 block mb-2">Tracking Mode</span>
        <div className="space-y-2 mb-4">
          {TRACKING_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setTrackingMode(m.key)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                trackingMode === m.key
                  ? "bg-green-700 text-amber-400 border-green-700"
                  : "bg-white text-gray-700 border-gray-100"
              }`}
            >
              <span className="text-2xl">{m.emoji}</span>
              <div className="flex-1">
                <p className="font-bold text-sm">{m.label}</p>
                <p className={`text-xs ${trackingMode === m.key ? "text-amber-200" : "text-gray-700"}`}>
                  {m.desc}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Round Type */}
        <span className="text-xs font-semibold text-gray-700 block mb-2">Round Type</span>
        <div className="flex gap-2 mb-4">
          {ROUND_TYPES.map((rt) => (
            <button
              key={rt.key}
              type="button"
              onClick={() => setRoundType(rt.key as any)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium ${
                roundType === rt.key ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
              }`}
            >
              {rt.label}
            </button>
          ))}
        </div>

        {/* Date */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-700 block mb-1">Date Played</label>
          <input
            type="date"
            value={datePlayed}
            onChange={(e) => setDatePlayed(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-600"
          />
        </div>

        {/* Weather */}
        <span className="text-xs font-semibold text-gray-700 block mb-2">Weather</span>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {WEATHER_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeather(weather === w ? "" : w)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${
                weather === w ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Wind */}
        <span className="text-xs font-semibold text-gray-700 block mb-2">Wind</span>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {WIND_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWind(wind === w ? "" : w)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${
                wind === w ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Visibility */}
        <span className="text-xs font-semibold text-gray-700 block mb-2">Visibility</span>
        <div className="flex gap-2 mb-4">
          {["private", "partners", "public"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize ${
                visibility === v ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Course conditions (advanced / strategy / mental) */}
        {(trackingMode === "advanced" || trackingMode === "strategy" || trackingMode === "mental") && (
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 space-y-3 mb-4">
            <span className="text-xs font-bold text-amber-800 block">Course Conditions</span>
            <Field label="Grass Type">
              <div className="flex flex-wrap gap-1.5">
                {GRASS_TYPES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrassType(grassType === g ? "" : g)}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium ${
                      grassType === g ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </Field>
            <ScaleButtons
              label="Green Firmness (1-5)"
              max={5}
              value={greenFirmness}
              onChange={setGreenFirmness}
            />
            <ScaleButtons
              label="Green Speed / Stimp (1-16)"
              max={16}
              value={greenSpeed}
              onChange={setGreenSpeed}
            />
            <Field label="Rough Thickness">
              <div className="flex flex-wrap gap-1.5">
                {ROUGH_THICKNESS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoughThickness(roughThickness === r ? "" : r)}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium ${
                      roughThickness === r ? "bg-green-700 text-amber-400" : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* Track Wedge & In (basic / advanced) */}
        {(trackingMode === "basic" || trackingMode === "advanced") && (
          <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-gray-100 mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Track Wedge & In</p>
              <p className="text-xs text-gray-700">Count wedge & in strokes per hole</p>
            </div>
            <button
              type="button"
              onClick={() => setTrackWedgeAndIn(!trackWedgeAndIn)}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                trackWedgeAndIn ? "bg-green-700" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${
                  trackWedgeAndIn ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setStep(4)}
          className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm shadow-sm active:scale-[0.98] transition-transform"
        >
          Continue →
        </button>
      </div>
    );
  }

  // ====== Step 4: Score Entry ======
  if (step === 4) {
    return (
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center mb-2">
          <button onClick={() => setStep(3)} className="text-green-700 text-sm mr-2">
            ← Back
          </button>
          <h1 className="text-xl font-bold text-green-800 flex-1">Score Entry</h1>
          <button onClick={() => setStep(5)} className="text-xs text-green-700 font-medium">
            Review →
          </button>
        </div>
        <p className="text-sm text-gray-700 mb-2">
          {selectedCourse?.name}
          {selectedTee && ` · ${selectedTee.name || selectedTee.color} tees`}
        </p>

        <SummaryBar totalScore={totalScore} totalPar={totalPar} totalPutts={totalPutts} showPutts={trackingMode !== "skip"} />

        {trackingMode === "skip" ? (
          <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
            <label className="text-xs font-semibold text-gray-700 block">Total Score</label>
            <input
              type="number"
              inputMode="numeric"
              value={totalScoreSkip || ""}
              onChange={(e) => setTotalScoreSkip(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-3 rounded-lg border border-gray-200 text-2xl font-bold text-center text-green-800 focus:outline-none focus:border-green-600"
              placeholder="Enter total"
            />
            <p className="text-xs text-gray-800">No per-hole data will be saved.</p>
            <button
              type="button"
              onClick={() => setStep(5)}
              className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm"
            >
              Review Round
            </button>
          </div>
        ) : (
          <>
            {/* Hole navigation pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
              {holeEntries.map((e, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentHole(i)}
                  className={`flex-shrink-0 w-9 h-9 rounded-full text-xs font-bold ${
                    i === currentHole
                      ? "bg-green-700 text-amber-400"
                      : e.score > 0
                        ? "bg-white text-green-700 border-2 border-amber-400"
                        : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            {/* Current hole */}
            {(() => {
              const entry = holeEntries[currentHole];
              return (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-bold text-green-800">Hole {currentHole + 1}</h2>
                    <span className="text-xs text-gray-700">
                      Par {getPar(currentHole)}
                      {getYardage(currentHole) ? ` · ${getYardage(currentHole)} yds` : ""}
                    </span>
                  </div>

                  {/* Yardage override for par 3s */}
                  {getPar(currentHole) === 3 && (
                    <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                      <span className="text-xs text-gray-700">Actual yardage:</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={entry.custom_yardage ?? ""}
                        onChange={(e) => {
                          const v = e.target.value ? parseInt(e.target.value) : null;
                          updateHoleEntry(currentHole, "custom_yardage", v);
                        }}
                        className="w-20 px-2 py-1 rounded border border-gray-200 text-sm text-center font-bold text-green-800 focus:outline-none focus:border-green-600"
                        placeholder={getYardage(currentHole)?.toString() || ""}
                      />
                      <span className="text-xs text-gray-800">yds (override)</span>
                    </div>
                  )}

                  {/* Scan Pin Sheet button */}
                  {trackingMode === "advanced" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowPinScanner(true)}
                        className="flex-1 py-2 rounded-xl bg-green-700 text-amber-400 font-bold text-xs flex items-center justify-center gap-1.5"
                      >
                        <span>📷</span> Scan Pin Sheet
                      </button>
                      {scannedPins.length > 0 && (
                        <span className="text-[11px] text-green-700 font-bold">
                          {scannedPins.length} pins loaded
                        </span>
                      )}
                    </div>
                  )}

                  <BasicHoleFields
                    entry={entry}
                    trackWI={trackWedgeAndIn}
                    onUpdate={(f, v) => updateHoleEntry(currentHole, f, v)}
                  />

                  {trackingMode === "advanced" && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-green-800">
                        Shots ({entry.shots.length})
                      </span>
                      {entry.shots.length === 0 && (
                        <p className="text-xs text-gray-800">Set a score above to add shots.</p>
                      )}
                      {entry.shots.map((shot, si) => {
                        const penaltiesBefore = entry.shots
                          .slice(0, si)
                          .filter((s) => s.is_penalty).length;
                        const displayShotNum = si + 1 + penaltiesBefore;
                        return (
                        <ShotCard
                          key={si}
                          shot={shot}
                          shotIdx={si}
                          displayShotNum={displayShotNum}
                          totalShots={entry.shots.length}
                          putts={entry.putts}
                          onUpdate={(f, v) => updateShot(currentHole, si, f, v)}
                        />
                        );
                      })}
                    </div>
                  )}

                  {trackingMode === "strategy" && (
                    <StrategySection
                      key={currentHole}
                      data={entry.strategy || defaultStrategy()}
                      onChange={(f, v) => updateStrategy(currentHole, f, v)}
                    />
                  )}

                  {trackingMode === "mental" && (
                    <MentalSection
                      key={currentHole}
                      data={entry.mental || defaultMental()}
                      onChange={(f, v) => updateMental(currentHole, f, v)}
                    />
                  )}
                </div>
              );
            })()}

            {/* Prev / Next / Review */}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setCurrentHole(Math.max(0, currentHole - 1))}
                disabled={currentHole === 0}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm disabled:opacity-40"
              >
                ← Prev
              </button>
              {currentHole < holeEntries.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentHole(currentHole + 1)}
                  className="flex-1 py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="flex-1 py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm"
                >
                  Review ✓
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ====== Step 5: Review & Save ======
  return (
    <div className="px-4 pt-4 pb-4">
      <div className="flex items-center mb-2">
        <button onClick={() => setStep(4)} className="text-green-700 text-sm mr-2">
          ← Back
        </button>
        <h1 className="text-xl font-bold text-green-800 flex-1">Review & Save</h1>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-2 mb-3 text-sm">
        <Row label="Course" value={selectedCourse?.name || "—"} />
        <Row
          label="Tee"
          value={selectedTee ? `${selectedTee.name || selectedTee.color}` : "—"}
        />
        <Row label="Date" value={datePlayed} />
        <Row label="Round Type" value={<span className="capitalize">{roundType}</span>} />
        <Row label="Tracking" value={<span className="capitalize">{trackingMode}</span>} />
        <Row label="Weather" value={weather || "—"} />
        <Row label="Wind" value={wind || "—"} />
        <Row label="Visibility" value={<span className="capitalize">{visibility}</span>} />
        {(trackingMode === "advanced" || trackingMode === "strategy" || trackingMode === "mental") && (
          <>
            <Row label="Grass" value={grassType || "—"} />
            <Row label="Green Firmness" value={greenFirmness || "—"} />
            <Row label="Green Speed" value={greenSpeed || "—"} />
            <Row label="Rough" value={roughThickness || "—"} />
          </>
        )}
      </div>

      <SummaryBar totalScore={totalScore} totalPar={totalPar} totalPutts={totalPutts} showPutts={trackingMode !== "skip"} />

      {trackingMode !== "skip" && (
        <div className="bg-white rounded-xl p-3 border border-gray-100 mb-3">
          <div className="grid grid-cols-6 gap-1 text-center text-xs">
            {holeEntries.map((e, i) => (
              <div key={i} className="py-1">
                <div className="text-gray-800 text-[10px]">H{i + 1}</div>
                <div className="font-bold text-green-800">{e.score || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={saveRound}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm shadow-sm active:scale-[0.98] transition-transform disabled:opacity-50 mb-4"
      >
        {saving ? "Saving..." : editingRoundId ? "Update Round" : "Save Round"}
      </button>

      {showPinScanner && (
        <PinScanner
          onApply={(pins) => {
            setScannedPins(pins);
            setShowPinScanner(false);
            // Auto-populate pin fields on existing approach shots
            setHoleEntries((prev) =>
              prev.map((e, hi) => {
                const pin = pins.find((p) => p.hole === hi + 1);
                if (!pin || e.shots.length === 0) return e;
                const shots = e.shots.map((s) => {
                  if (s.intention !== "hit_green") return s;
                  return {
                    ...s,
                    pin_depth_front: pin.front || s.pin_depth_front,
                    pin_side_dist: pin.side || s.pin_side_dist,
                    pin_side_dir: pin.sideDir || s.pin_side_dir,
                    pin_center_offset: pin.center || s.pin_center_offset,
                    pin_green_depth: pin.depth || s.pin_green_depth,
                  };
                });
                return { ...e, shots };
              })
            );
          }}
          onClose={() => setShowPinScanner(false)}
        />
      )}
    </div>
  );
}
