// Score badge — shows score relative to par as a colored pill
export default function ScoreBadge({
  score,
  par,
  size = "sm",
}: {
  score: number;
  par: number;
  size?: "sm" | "md" | "lg";
}) {
  if (!score || !par) return <span className="text-gray-400">—</span>;

  const diff = score - par;
  const color =
    diff <= -2 ? "#7c3aed" : // Eagle
    diff === -1 ? "#d4a843" : // Birdie
    diff === 0 ? "#0a7d32" : // Par
    diff === 1 ? "#f59e0b" : // Bogey
    "#dc2626"; // Double+

  const sizeClass =
    size === "lg" ? "w-10 h-10 text-lg" :
    size === "md" ? "w-8 h-8 text-sm" :
    "w-6 h-6 text-xs";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold text-white ${sizeClass}`}
      style={{ backgroundColor: color }}
    >
      {score}
    </span>
  );
}
