"use client";

import { useState, useRef, useCallback } from "react";

export interface PinData {
  hole: number;
  front: string;
  side: string;
  sideDir: string;
  center: string;
  depth: string;
}

interface PinScannerProps {
  onApply: (pins: PinData[]) => void;
  onClose: () => void;
}

export default function PinScanner({ onApply, onClose }: PinScannerProps) {
  const [image, setImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pins, setPins] = useState<PinData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setImage(URL.createObjectURL(file));
    setProcessing(true);
    setError(null);
    try {
      // Dynamic import to avoid loading Tesseract on every page load
      const { default: Tesseract } = await import("tesseract.js");
      const result = await Tesseract.recognize(file, "eng");
      const text = result.data.text;
      const parsed = parsePinSheet(text);
      if (parsed.length === 0) {
        setError("Could not read pin positions from this image. Try a clearer photo or enter pins manually.");
      } else {
        setPins(parsed);
      }
    } catch (err) {
      setError("OCR processing failed. Try a clearer photo or enter pins manually.");
    }
    setProcessing(false);
  }, []);

  const parsePinSheet = (text: string): PinData[] => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const results: PinData[] = [];
    const seen = new Set<number>();

    // Helper: extract number from string
    const num = (s: string): string => {
      const m = s.match(/-?\d+/);
      return m ? m[0] : "";
    };

    // Try multiple parsing strategies

    // Strategy 1: Line-by-line with hole number detection
    // Patterns like:
    //   "Hole 1  32  L 8  -4  D:38"
    //   "1: 32 on  8 L  -4  D:38"
    //   "1  F32  L8  C-4  D38"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Try to find a hole number at start of line
      const holeMatch = line.match(/^(?:hole\s*)?(\d{1,2})\s*[:.\)\s]/i);
      if (!holeMatch) continue;
      const holeNum = parseInt(holeMatch[1]);
      if (holeNum < 1 || holeNum > 18 || seen.has(holeNum)) continue;

      const pin = parseLineForPin(line);
      if (pin) {
        results.push({ ...pin, hole: holeNum });
        seen.add(holeNum);
      }
    }

    // Strategy 2: If we didn't find holes, try parsing numbers in sequence
    // Some sheets have: "1 32 8 L -4 38" (hole, front, side, dir, center, depth)
    if (results.length < 3) {
      results.length = 0;
      seen.clear();
      const allText = lines.join(" ");
      // Find all tokens
      const tokens = allText.split(/[\s,;|]+/).filter(Boolean);
      let idx = 0;
      while (idx < tokens.length) {
        const t = tokens[idx];
        // Check if this is a hole number (1-18)
        if (/^\d{1,2}$/.test(t) && parseInt(t) >= 1 && parseInt(t) <= 18 && !seen.has(parseInt(t))) {
          const holeNum = parseInt(t);
          // Try to grab the next several tokens as pin data
          const remaining = tokens.slice(idx + 1, idx + 8).join(" ");
          const pin = parseLineForPin(remaining);
          if (pin && (pin.front || pin.side || pin.center)) {
            results.push({ ...pin, hole: holeNum });
            seen.add(holeNum);
            idx += 1;
            continue;
          }
        }
        idx++;
      }
    }

    // Sort by hole number
    results.sort((a, b) => a.hole - b.hole);
    return results;
  };

  // Parse a single line/text block for pin data
  const parseLineForPin = (text: string): PinData | null => {
    let front = "";
    let side = "";
    let sideDir = "";
    let center = "";
    let depth = "";

    // Depth: "D:38" or "D 38" or "depth 38"
    const dMatch = text.match(/D\s*[:\s]\s*(\d{1,2})/i);
    if (dMatch) depth = dMatch[1];

    // Center offset: "+4" or "-4" or "C:+4" or "center -4" or "C -4"
    const cMatch = text.match(/(?:C|center|ctr)\s*[:\s]\s*([+-]?\d{1,2})/i);
    if (cMatch) {
      center = cMatch[1];
    } else {
      // Look for standalone + or - number
      const pmMatch = text.match(/(?:^|\s)([+-]\d{1,2})(?:\s|$)/);
      if (pmMatch) center = pmMatch[1];
    }

    // Side: "L8" or "L 8" or "8L" or "8 L" or "Left 8" or "8 Left"
    const lMatch = text.match(/(?:L|left)\s*[:\s]*(\d{1,2})/i);
    const rMatch = text.match(/(?:R|right)\s*[:\s]*(\d{1,2})/i);
    // Also try: number followed by L/R
    const nlMatch = text.match(/(\d{1,2})\s*(?:L|left)/i);
    const nrMatch = text.match(/(\d{1,2})\s*(?:R|right)/i);

    if (lMatch) {
      side = lMatch[1];
      sideDir = "L";
    } else if (rMatch) {
      side = rMatch[1];
      sideDir = "R";
    } else if (nlMatch) {
      side = nlMatch[1];
      sideDir = "L";
    } else if (nrMatch) {
      side = nrMatch[1];
      sideDir = "R";
    }

    // Front: "F32" or "F 32" or "front 32" or "32 on" or "on 32"
    const fMatch = text.match(/(?:F|front|fr)\s*[:\s]*(\d{1,2})/i);
    const onMatch = text.match(/(\d{1,2})\s*on/i);
    const onMatch2 = text.match(/on\s*(\d{1,2})/i);
    if (fMatch) {
      front = fMatch[1];
    } else if (onMatch) {
      front = onMatch[1];
    } else if (onMatch2) {
      front = onMatch2[1];
    } else {
      // First bare number that isn't the hole number, side, center, or depth
      const allNums = text.match(/(?:^|\s)(\d{1,2})(?:\s|$)/g);
      if (allNums) {
        const usedNums = new Set<string>();
        if (depth) usedNums.add(depth);
        if (side) usedNums.add(side);
        const centerNum = center.replace(/[+-]/, "");
        if (centerNum) usedNums.add(centerNum);
        for (const n of allNums) {
          const val = n.trim();
          if (!usedNums.has(val) && parseInt(val) >= 1 && parseInt(val) <= 45) {
            front = val;
            break;
          }
        }
      }
    }

    if (!front && !side && !center && !depth) return null;
    return { hole: 0, front, side, sideDir, center, depth };
  };

  const updatePin = (hole: number, field: keyof PinData, value: string) => {
    setPins((prev) => prev?.map((p) => p.hole === hole ? { ...p, [field]: value } : p) || null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-sm font-bold text-green-800">Scan Pin Sheet</h2>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          {!image && !processing && (
            <div>
              <p className="text-xs text-gray-500 mb-3">
                Take a photo of the course pin sheet. The app will try to read all 18 pin positions automatically.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 rounded-xl bg-green-700 text-amber-400 font-bold text-sm"
              >
                Take Photo
              </button>
            </div>
          )}

          {processing && (
            <div className="text-center py-8">
              <div className="inline-block w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs text-gray-500">Reading pin sheet...</p>
            </div>
          )}

          {error && (
            <div className="space-y-3">
              <p className="text-xs text-red-600">{error}</p>
              <button
                onClick={() => { setImage(null); setError(null); setPins(null); fileInputRef.current?.click(); }}
                className="w-full py-2.5 rounded-xl bg-green-700 text-amber-400 font-bold text-sm"
              >
                Try Again
              </button>
              <button
                onClick={() => { setError(null); setPins(Array.from({length: 18}, (_, i) => ({ hole: i + 1, front: "", side: "", sideDir: "", center: "", depth: "" }))); }}
                className="w-full py-2.5 rounded-xl bg-gray-200 text-gray-700 font-bold text-sm"
              >
                Enter Manually
              </button>
            </div>
          )}

          {image && !processing && pins && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  {pins.length} pin{pins.length !== 1 ? "s" : ""} found. Review and edit before applying.
                </p>
                <button
                  onClick={() => { setImage(null); setPins(null); fileInputRef.current?.click(); }}
                  className="text-xs text-green-700 font-bold"
                >
                  Retake
                </button>
              </div>

              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                {pins.map((pin) => (
                  <div key={pin.hole} className="flex items-center gap-1.5 bg-gray-50 rounded-lg p-2">
                    <span className="text-xs font-bold text-green-800 w-6">H{pin.hole}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Front"
                      value={pin.front}
                      onChange={(e) => updatePin(pin.hole, "front", e.target.value)}
                      className="w-12 px-1.5 py-1 rounded border border-gray-200 text-[11px] focus:outline-none focus:border-green-600"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Side"
                      value={pin.side}
                      onChange={(e) => updatePin(pin.hole, "side", e.target.value)}
                      className="w-12 px-1.5 py-1 rounded border border-gray-200 text-[11px] focus:outline-none focus:border-green-600"
                    />
                    <select
                      value={pin.sideDir}
                      onChange={(e) => updatePin(pin.hole, "sideDir", e.target.value)}
                      className="px-1 py-1 rounded border border-gray-200 text-[11px] focus:outline-none focus:border-green-600"
                    >
                      <option value="">?</option>
                      <option value="L">L</option>
                      <option value="R">R</option>
                    </select>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="+/-"
                      value={pin.center}
                      onChange={(e) => updatePin(pin.hole, "center", e.target.value)}
                      className="w-12 px-1.5 py-1 rounded border border-gray-200 text-[11px] focus:outline-none focus:border-green-600"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="D"
                      value={pin.depth}
                      onChange={(e) => updatePin(pin.hole, "depth", e.target.value)}
                      className="w-12 px-1.5 py-1 rounded border border-gray-200 text-[11px] focus:outline-none focus:border-green-600"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => onApply(pins)}
                  className="flex-1 py-2.5 rounded-xl bg-green-700 text-amber-400 font-bold text-sm"
                >
                  Apply Pin Positions
                </button>
                <button
                  onClick={() => { setImage(null); setPins(null); fileInputRef.current?.click(); }}
                  className="py-2.5 px-4 rounded-xl bg-gray-200 text-gray-700 font-bold text-sm"
                >
                  Retake
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
