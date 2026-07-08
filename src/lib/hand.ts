import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from "@mediapipe/tasks-vision";
import type { HandMetrics } from "../types/domain";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let handLandmarkerPromise: Promise<HandLandmarker> | null = null;

export async function getHandLandmarker(): Promise<HandLandmarker> {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = FilesetResolver.forVisionTasks(WASM_ROOT).then((vision) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
        },
        runningMode: "IMAGE",
        numHands: 1,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
      }),
    );
  }
  return handLandmarkerPromise;
}

export async function detectHand(image: HTMLImageElement): Promise<{ result: HandLandmarkerResult; metrics: HandMetrics }> {
  const landmarker = await getHandLandmarker();
  const result = landmarker.detect(image);
  return { result, metrics: summarizeHandResult(result) };
}

export function summarizeHandResult(result: HandLandmarkerResult): HandMetrics {
  const landmarks = result.landmarks?.[0] ?? [];
  const handedness = result.handedness?.[0]?.[0];
  if (landmarks.length === 0) {
    return { detected: false, confidence: 0, landmarkCount: 0 };
  }

  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const palmWidthRatio =
    indexMcp && pinkyMcp
      ? Math.hypot(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y)
      : Math.hypot(maxX - minX, maxY - minY);

  return {
    detected: true,
    confidence: handedness?.score ?? 0.5,
    handedness: handedness?.categoryName,
    boundingBox: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
    palmWidthRatio,
    landmarkCount: landmarks.length,
  };
}

export function landmarksToSvgPoints(result: HandLandmarkerResult | null, width: number, height: number): string[] {
  const landmarks = result?.landmarks?.[0] ?? [];
  return landmarks.map((point) => `${point.x * width},${point.y * height}`);
}
