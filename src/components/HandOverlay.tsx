import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

interface HandOverlayProps {
  result: HandLandmarkerResult | null;
}

export function HandOverlay({ result }: HandOverlayProps) {
  const landmarks = result?.landmarks?.[0] ?? [];
  if (landmarks.length === 0) return null;

  return (
    <svg className="hand-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {CONNECTIONS.map(([from, to]) => {
        const start = landmarks[from];
        const end = landmarks[to];
        if (!start || !end) return null;
        return (
          <line
            key={`${from}-${to}`}
            x1={start.x * 100}
            y1={start.y * 100}
            x2={end.x * 100}
            y2={end.y * 100}
          />
        );
      })}
      {landmarks.map((point, index) => (
        <circle cx={point.x * 100} cy={point.y * 100} key={index} r="1.15" />
      ))}
    </svg>
  );
}
