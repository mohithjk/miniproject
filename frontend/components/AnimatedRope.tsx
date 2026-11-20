"use client";

import React from "react";

// ============================================================================
// TIMING CONSTANTS (in seconds)
// ============================================================================
export const FLOW_SECONDS = 3.2;      // Duration of one flow cycle
export const PAUSE_SECONDS = 1.0;     // Pause duration where no rope/dots are visible (1 second)
export const STAGGER_SECONDS = 0.25;  // Stagger delay between paths

// Calculate the shared single-timeline loop duration:
// Pause starts counting after the LAST path finishes its flow, ensuring the pause
// stays exactly PAUSE_SECONDS (1 second) before all paths restart together.
const LAST_FINISH_SECONDS = (2 * STAGGER_SECONDS) + FLOW_SECONDS;
const TOTAL_CYCLE_SECONDS = LAST_FINISH_SECONDS + PAUSE_SECONDS;

// Helper to convert time in seconds to keyframe percentage string on the shared timeline
const p = (seconds: number) =>
  `${((Math.min(Math.max(seconds, 0), TOTAL_CYCLE_SECONDS) / TOTAL_CYCLE_SECONDS) * 100).toFixed(2)}%`;

export interface RopeNode {
  id: string;
  cx: number;
  cy: number;
  r: number;
  arrive: number; // Time (s) when segment reaches this dot and it glows
  fade: number;   // Time (s) when segment finishes and fades out
}

const ROPE_NODES: RopeNode[] = [
  { id: "node-start-left",  cx: 56,  cy: 270, r: 1.9, arrive: 0,                                                    fade: FLOW_SECONDS },
  { id: "node-fork-left",   cx: 228, cy: 200, r: 2.1, arrive: STAGGER_SECONDS,                                    fade: STAGGER_SECONDS + FLOW_SECONDS },
  { id: "node-fork-center", cx: 268, cy: 155, r: 2.0, arrive: 2 * STAGGER_SECONDS,                                fade: 2 * STAGGER_SECONDS + FLOW_SECONDS },
  { id: "node-mid-right",   cx: 395, cy: 180, r: 2.0, arrive: STAGGER_SECONDS + (FLOW_SECONDS * 0.58),            fade: STAGGER_SECONDS + FLOW_SECONDS },
  { id: "node-tip-top",     cx: 316, cy: 82,  r: 1.8, arrive: FLOW_SECONDS - 0.35,                                fade: FLOW_SECONDS },
  { id: "node-tip-right",   cx: 506, cy: 142, r: 1.8, arrive: STAGGER_SECONDS + FLOW_SECONDS - 0.35,            fade: STAGGER_SECONDS + FLOW_SECONDS },
  { id: "node-tip-middle",  cx: 390, cy: 102, r: 1.8, arrive: (2 * STAGGER_SECONDS) + FLOW_SECONDS - 0.35,      fade: (2 * STAGGER_SECONDS) + FLOW_SECONDS },
];

function generateNodeKeyframe(node: RopeNode) {
  const steps: { t: number; opacity: number; scale: number }[] = [];
  steps.push({ t: 0, opacity: 0, scale: 0.6 });

  if (node.arrive > 0.05) {
    steps.push({ t: Math.max(0.01, node.arrive - 0.05), opacity: 0, scale: 0.6 });
  }

  const peakTime = Math.min(node.arrive + 0.2, (node.arrive + node.fade) / 2);
  steps.push({ t: peakTime, opacity: 1, scale: 1.4 });

  if (node.fade - peakTime > 0.4) {
    steps.push({ t: peakTime + 0.25, opacity: 0.95, scale: 1.0 });
    steps.push({ t: node.fade - 0.2, opacity: 0.95, scale: 1.0 });
  }

  steps.push({ t: node.fade, opacity: 0, scale: 0.6 });
  steps.push({ t: TOTAL_CYCLE_SECONDS, opacity: 0, scale: 0.6 });

  return `
    @keyframes pulse-${node.id} {
      ${steps.map((s) => `${p(s.t)} { opacity: ${s.opacity}; transform: scale(${s.scale}); }`).join("\n      ")}
    }
  `;
}

export function AnimatedRope() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 560 312"
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <defs>
        <filter id="gold-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#FFD33D" floodOpacity="0.8" />
        </filter>
      </defs>

      <style>{`
        /* Path 1: Flows along lower-left to upper branches */
        @keyframes rope-flow-path-1 {
          0% {
            opacity: 0;
            stroke-dashoffset: 0;
          }
          ${p(0.15)} {
            opacity: 1;
          }
          ${p(FLOW_SECONDS - 0.35)} {
            opacity: 1;
          }
          ${p(FLOW_SECONDS)} {
            opacity: 0;
            stroke-dashoffset: -50;
          }
          ${p(FLOW_SECONDS + 0.05)}, 100% {
            opacity: 0;
            stroke-dashoffset: -50;
          }
        }

        /* Path 2: Solid path drawing across right branches */
        @keyframes rope-flow-path-2 {
          0%, ${p(STAGGER_SECONDS)} {
            opacity: 0;
            stroke-dashoffset: 310;
          }
          ${p(STAGGER_SECONDS + 0.15)} {
            opacity: 1;
          }
          ${p(STAGGER_SECONDS + FLOW_SECONDS - 0.35)} {
            opacity: 1;
            stroke-dashoffset: 0;
          }
          ${p(STAGGER_SECONDS + FLOW_SECONDS)} {
            opacity: 0;
            stroke-dashoffset: 0;
          }
          ${p(STAGGER_SECONDS + FLOW_SECONDS + 0.05)}, 100% {
            opacity: 0;
            stroke-dashoffset: 310;
          }
        }

        /* Path 3: Solid path drawing through middle branches */
        @keyframes rope-flow-path-3 {
          0%, ${p(2 * STAGGER_SECONDS)} {
            opacity: 0;
            stroke-dashoffset: 150;
          }
          ${p((2 * STAGGER_SECONDS) + 0.15)} {
            opacity: 1;
          }
          ${p((2 * STAGGER_SECONDS) + FLOW_SECONDS - 0.35)} {
            opacity: 1;
            stroke-dashoffset: 0;
          }
          ${p((2 * STAGGER_SECONDS) + FLOW_SECONDS)} {
            opacity: 0;
            stroke-dashoffset: 0;
          }
          ${p((2 * STAGGER_SECONDS) + FLOW_SECONDS + 0.05)}, 100% {
            opacity: 0;
            stroke-dashoffset: 150;
          }
        }

        /* Individual node keyframes synchronized with flow segment passage */
        ${ROPE_NODES.map(generateNodeKeyframe).join("\n")}

        .animated-rope-path-1 {
          stroke: #FFD33D;
          stroke-width: 2.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
          stroke-dasharray: 2 8;
          animation: rope-flow-path-1 ${TOTAL_CYCLE_SECONDS}s linear infinite;
          filter: drop-shadow(0 0 2px #FFD33D);
        }

        .animated-rope-path-2 {
          stroke: #FFD33D;
          stroke-width: 2.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
          stroke-dasharray: 310;
          stroke-dashoffset: 310;
          animation: rope-flow-path-2 ${TOTAL_CYCLE_SECONDS}s cubic-bezier(0.25, 1, 0.5, 1) infinite;
          filter: drop-shadow(0 0 2px #FFD33D);
        }

        .animated-rope-path-3 {
          stroke: #FFD33D;
          stroke-width: 2.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
          stroke-dasharray: 150;
          stroke-dashoffset: 150;
          animation: rope-flow-path-3 ${TOTAL_CYCLE_SECONDS}s cubic-bezier(0.25, 1, 0.5, 1) infinite;
          filter: drop-shadow(0 0 2px #FFD33D);
        }

        .animated-rope-node {
          transform-box: fill-box;
          transform-origin: center;
          filter: url(#gold-glow);
        }

        @media (prefers-reduced-motion: reduce) {
          .animated-rope-path-1,
          .animated-rope-path-2,
          .animated-rope-path-3,
          .animated-rope-node {
            animation: none !important;
            stroke-dashoffset: 0 !important;
            transform: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* Path 1: Longest path weaving from lower-left to upper canopy */}
      <path
        className="animated-rope-path-1"
        d="M 56 270 C 118 260 168 232 228 200 C 256 185 266 146 282 116 C 293 96 302 86 316 82"
      />

      {/* Path 2: Solid path sweeping across the right side out to branch tips */}
      <path
        className="animated-rope-path-2"
        d="M 228 200 C 285 192 342 200 395 180 C 440 162 472 148 506 142"
      />

      {/* Path 3: Solid path curving through middle branches */}
      <path
        className="animated-rope-path-3"
        d="M 268 155 C 295 138 330 144 358 126 C 372 116 380 108 390 102"
      />

      {/* Pulsing gold nodes at branch junctions, intersections, and ends */}
      <g className="animated-rope-nodes-group">
        {ROPE_NODES.map((node) => (
          <circle
            key={node.id}
            className="animated-rope-node"
            cx={node.cx}
            cy={node.cy}
            r={node.r}
            fill="#FFD33D"
            style={{
              animation: `pulse-${node.id} ${TOTAL_CYCLE_SECONDS}s ease-in-out infinite`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}
