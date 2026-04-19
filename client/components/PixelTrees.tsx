import React from "react";
import { useTheme } from "../hooks/useTheme.tsx";

// Pixel art cherry blossom tree as a grid - each row is a string of hex color codes
// '.' = transparent, 'p' = pink blossom, 'P' = dark pink, 'b' = brown trunk, 'g' = green leaf
const TREE_1 = [
  "......ppPpp......",
  "....pPppPpPp.....",
  "...PpppPppPpp....",
  "..ppPpppppPpPp...",
  ".pPppPpppPppPp...",
  ".ppPpppPpppPpp...",
  "..pPppPppPpPp....",
  "...ppPpppPpp.....",
  "....ppPpPp.......",
  ".......bb........",
  ".......bb........",
  ".......bb........",
  ".......bb........",
  "......bbbb.......",
];

const TREE_2 = [
  "...ppPp.....ppPp...",
  "..PpppPp...pPpPpp..",
  ".ppPppPpp.PppPppPp.",
  ".pPpppPpPppPpppPpp.",
  "ppPppPpppPpppPppPp.",
  ".pPpppPppPppPpppPp.",
  "..ppPpppPpppPpPp...",
  "...ppPppPppPpp.....",
  "....pPpppPp........",
  "......bbb..........",
  ".......bb..........",
  ".......bb..........",
  ".......bb..........",
  "......bbbb.........",
  ".....bbbbbb........",
];

const TREE_3 = [
  "....pPpp.....",
  "..pPppPpPp...",
  ".PpppPppPpp..",
  "pPppPpppPpPp.",
  "ppPpppPpppPp.",
  ".PppPpppPpPp.",
  "..ppPppPpp...",
  "....pPpp.....",
  ".....bb......",
  ".....bb......",
  ".....bb......",
  "....bbbb.....",
];

const TREES = [TREE_1, TREE_2, TREE_3];

const COLOR_MAP: Record<string, string> = {
  p: "#ffb7c5",
  P: "#e75480",
  b: "#8B5E3C",
  B: "#6B3F2A",
  g: "#7CB342",
  ".": "transparent",
};

const PIXEL = 4;

function renderTree(grid: string[], scale: number) {
  const height = grid.length;
  const width = Math.max(...grid.map((r) => r.length));
  const rects: React.ReactNode[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const ch = grid[y][x];
      if (ch === ".") continue;
      const color = COLOR_MAP[ch] ?? "#ff00ff";
      rects.push(
        <rect
          key={`${x}-${y}`}
          x={x * PIXEL}
          y={y * PIXEL}
          width={PIXEL}
          height={PIXEL}
          fill={color}
        />,
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width * PIXEL} ${height * PIXEL}`}
      width={width * PIXEL * scale}
      height={height * PIXEL * scale}
      style={{ shapeRendering: "crispEdges", imageRendering: "pixelated" }}
    >
      {rects}
    </svg>
  );
}

interface TreePlacement {
  treeIndex: number;
  x: number;
  scale: number;
  flip: boolean;
}

const PLACEMENTS: TreePlacement[] = [
  { treeIndex: 0, x: 5, scale: 1.0, flip: false },
  { treeIndex: 2, x: 35, scale: 0.8, flip: true },
  { treeIndex: 1, x: 60, scale: 0.9, flip: false },
];

export default function PixelTrees() {
  const { theme } = useTheme();
  if (theme !== "sakura") return null;

  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 overflow-visible"
      aria-hidden="true"
    >
      {PLACEMENTS.map((p, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${p.x}%`,
            bottom: 0,
            transform: p.flip ? "scaleX(-1)" : undefined,
            opacity: 0.85,
          }}
        >
          {renderTree(TREES[p.treeIndex], p.scale)}
        </div>
      ))}
    </div>
  );
}
