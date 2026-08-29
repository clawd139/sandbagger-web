// ScoreCell — golf score display with circles and boxes
// Eagle: double circle, yellow | Birdie: single circle, red | Par: green number, no shape
// Bogey: single box, black | Double bogey: double box, blue | Triple+: N circles, blue

const EAGLE_COLOR = "#B8860B"; // dark goldenrod — visible on white background
const BIRDIE_COLOR = "#D32F2F"; // red
const PAR_COLOR = "#0a7d32"; // green
const BOGEY_COLOR = "#000000"; // black
const DOUBLE_COLOR = "#1D4ED8"; // blue

export default function ScoreCell({
  score,
  par,
  size = 14,
  mini = false,
}: {
  score: number;
  par: number;
  size?: number;
  mini?: boolean;
}) {
  if (!score || !par) {
    return <span className="font-bold text-gray-800" style={{ fontSize: size }}>—</span>;
  }

  const diff = score - par;
  const baseSize = mini ? size + 10 : size + 14;

  // Eagle or better: double circle, yellow
  if (diff <= -2) {
    return renderNestedShapes(2, "circle", EAGLE_COLOR, baseSize, size, score);
  }

  // Birdie: single circle, red
  if (diff === -1) {
    return renderNestedShapes(1, "circle", BIRDIE_COLOR, baseSize, size, score);
  }

  // Par: green number, no shape
  if (diff === 0) {
    return (
      <span
        style={{
          width: baseSize,
          height: baseSize,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="font-bold" style={{ fontSize: size, color: PAR_COLOR }}>
          {score}
        </span>
      </span>
    );
  }

  // Bogey: single box, black
  if (diff === 1) {
    return renderNestedShapes(1, "box", BOGEY_COLOR, baseSize, size, score);
  }

  // Double bogey: double box, blue
  if (diff === 2) {
    return renderNestedShapes(2, "box", DOUBLE_COLOR, baseSize, size, score);
  }

  // Triple bogey+: N circles, blue (N = diff)
  return renderNestedShapes(diff, "circle", DOUBLE_COLOR, baseSize, size, score);
}

/**
 * Render N nested shapes (circles or boxes) around the score number.
 * Each layer is `step` px smaller than the one outside it.
 */
function renderNestedShapes(
  count: number,
  shape: "circle" | "box",
  color: string,
  baseSize: number,
  fontSize: number,
  score: number,
) {
  const step = count > 3 ? 3 : 4;
  // Grow the cell for larger counts so the innermost shape still fits the number
  const cellSize = count > 3 ? baseSize + (count - 3) * 2 : baseSize;
  const borderRadius = shape === "circle" ? "50%" : 2;

  // Build from innermost (the number) outward
  let inner: React.ReactNode = (
    <span className="font-bold" style={{ fontSize, color }}>
      {score}
    </span>
  );

  for (let i = 0; i < count; i++) {
    const layerSize = cellSize - i * step;
    inner = (
      <span
        style={{
          width: layerSize,
          height: layerSize,
          borderRadius,
          border: `2px solid ${color}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {inner}
      </span>
    );
  }

  return (
    <span
      style={{
        width: cellSize,
        height: cellSize,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {inner}
    </span>
  );
}
