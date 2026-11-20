"use client";

import React from "react";

// ============================================================================
// PETAL CONFIGURATION
// Easily adjust petal count, start positions, fall speeds, and colors here:
// ============================================================================
export interface PetalConfig {
  id: number;
  startX: number;    // Starting X position in SVG viewBox (0 to 560)
  startY: number;    // Starting Y position in canopy (upper 55%: 30 to 165)
  size: number;      // Petal scale multiplier (renders 8px to 16px)
  speed: number;     // Fall duration in seconds (7s to 14s)
  delay: number;     // Negative start delay for immediate mid-flight flow
  color: string;     // Blossom colors: soft pinks and cream
  swayType: 1 | 2 | 3 | 4; // Sway trajectory variant (with rightward breeze)
}

export const FALLING_PETALS: PetalConfig[] = [
  { id: 1,  startX: 110, startY: 85,  size: 1.05, speed: 8.5,  delay: -1.8, color: "#F6B8CB", swayType: 1 },
  { id: 2,  startX: 155, startY: 120, size: 0.85, speed: 9.8,  delay: -4.5, color: "#FAD2DE", swayType: 2 },
  { id: 3,  startX: 195, startY: 65,  size: 1.15, speed: 7.6,  delay: -2.3, color: "#F29DB8", swayType: 3 },
  { id: 4,  startX: 235, startY: 105, size: 0.95, speed: 11.2, delay: -6.1, color: "#FFF1D6", swayType: 4 },
  { id: 5,  startX: 275, startY: 45,  size: 1.20, speed: 8.0,  delay: -0.9, color: "#F6B8CB", swayType: 1 },
  { id: 6,  startX: 310, startY: 90,  size: 0.80, speed: 12.5, delay: -7.4, color: "#FDF6E3", swayType: 2 },
  { id: 7,  startX: 345, startY: 70,  size: 1.10, speed: 9.0,  delay: -3.2, color: "#F29DB8", swayType: 3 },
  { id: 8,  startX: 385, startY: 115, size: 0.90, speed: 10.4, delay: -5.8, color: "#FAD2DE", swayType: 4 },
  { id: 9,  startX: 425, startY: 80,  size: 1.00, speed: 8.8,  delay: -1.4, color: "#F6B8CB", swayType: 1 },
  { id: 10, startX: 465, startY: 125, size: 0.75, speed: 13.0, delay: -8.2, color: "#FFF1D6", swayType: 2 },
  { id: 11, startX: 135, startY: 145, size: 0.85, speed: 10.0, delay: -3.9, color: "#F29DB8", swayType: 3 },
  { id: 12, startX: 175, startY: 95,  size: 1.10, speed: 8.2,  delay: -5.1, color: "#FAD2DE", swayType: 4 },
  { id: 13, startX: 215, startY: 135, size: 0.90, speed: 11.8, delay: -2.7, color: "#FDF6E3", swayType: 1 },
  { id: 14, startX: 255, startY: 75,  size: 1.15, speed: 7.8,  delay: -4.8, color: "#F6B8CB", swayType: 2 },
  { id: 15, startX: 295, startY: 125, size: 0.80, speed: 13.5, delay: -9.5, color: "#FFF1D6", swayType: 3 },
  { id: 16, startX: 330, startY: 55,  size: 1.05, speed: 9.4,  delay: -1.1, color: "#F29DB8", swayType: 4 },
  { id: 17, startX: 370, startY: 140, size: 0.95, speed: 10.8, delay: -6.6, color: "#FAD2DE", swayType: 1 },
  { id: 18, startX: 410, startY: 105, size: 1.00, speed: 8.4,  delay: -3.5, color: "#F6B8CB", swayType: 2 },
  { id: 19, startX: 250, startY: 155, size: 0.85, speed: 12.0, delay: -7.0, color: "#F29DB8", swayType: 3 },
  { id: 20, startX: 350, startY: 160, size: 0.90, speed: 10.5, delay: -4.3, color: "#FFF1D6", swayType: 4 },
];

export const RESTING_PETALS = [
  { id: 1, x: 175, y: 285, size: 0.90, rotation: 22,  color: "#F6B8CB" },
  { id: 2, x: 250, y: 287, size: 0.85, rotation: -32, color: "#FAD2DE" },
  { id: 3, x: 330, y: 286, size: 1.00, rotation: 18,  color: "#FFF1D6" },
  { id: 4, x: 405, y: 288, size: 0.80, rotation: -15, color: "#F29DB8" },
];

export function FallingPetals() {
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
        {/* Soft petal with a tiny notch at the tip */}
        <path
          id="single-petal-shape"
          d="M0,0 C-3.2,-4.5 -5,-9 -2,-13 C-0.7,-11.8 0.7,-11.8 2,-13 C5,-9 3.2,-4.5 0,0 Z"
        />
      </defs>

      <style>{`
        @keyframes petal-sway-drift-1 {
          0% {
            opacity: 0;
            transform: translate(0px, 0px) rotate(0deg);
          }
          12% {
            opacity: 0.95;
          }
          35% {
            transform: translate(calc(var(--drift-x, 18px) * 0.4), calc(var(--travel-y, 180px) * 0.32)) rotate(45deg);
          }
          65% {
            transform: translate(calc(var(--drift-x, 18px) * 0.1), calc(var(--travel-y, 180px) * 0.65)) rotate(115deg);
          }
          85% {
            opacity: 0.85;
            transform: translate(calc(var(--drift-x, 18px) * 0.7), calc(var(--travel-y, 180px) * 0.88)) rotate(180deg);
          }
          95% {
            opacity: 0.35;
          }
          100% {
            opacity: 0;
            transform: translate(var(--drift-x, 18px), var(--travel-y, 180px)) rotate(240deg);
          }
        }

        @keyframes petal-sway-drift-2 {
          0% {
            opacity: 0;
            transform: translate(0px, 0px) rotate(0deg);
          }
          12% {
            opacity: 0.95;
          }
          32% {
            transform: translate(calc(var(--drift-x, 24px) * 0.5), calc(var(--travel-y, 180px) * 0.30)) rotate(-50deg);
          }
          62% {
            transform: translate(calc(var(--drift-x, 24px) * 0.2), calc(var(--travel-y, 180px) * 0.62)) rotate(-125deg);
          }
          85% {
            opacity: 0.85;
            transform: translate(calc(var(--drift-x, 24px) * 0.8), calc(var(--travel-y, 180px) * 0.88)) rotate(-195deg);
          }
          95% {
            opacity: 0.35;
          }
          100% {
            opacity: 0;
            transform: translate(var(--drift-x, 24px), var(--travel-y, 180px)) rotate(-265deg);
          }
        }

        @keyframes petal-sway-drift-3 {
          0% {
            opacity: 0;
            transform: translate(0px, 0px) rotate(0deg);
          }
          15% {
            opacity: 0.95;
          }
          35% {
            transform: translate(calc(var(--drift-x, 16px) * -0.3), calc(var(--travel-y, 180px) * 0.35)) rotate(38deg);
          }
          68% {
            transform: translate(calc(var(--drift-x, 16px) * 0.5), calc(var(--travel-y, 180px) * 0.68)) rotate(98deg);
          }
          88% {
            opacity: 0.85;
            transform: translate(calc(var(--drift-x, 16px) * 0.2), calc(var(--travel-y, 180px) * 0.88)) rotate(165deg);
          }
          95% {
            opacity: 0.35;
          }
          100% {
            opacity: 0;
            transform: translate(var(--drift-x, 16px), var(--travel-y, 180px)) rotate(215deg);
          }
        }

        @keyframes petal-sway-drift-4 {
          0% {
            opacity: 0;
            transform: translate(0px, 0px) rotate(0deg);
          }
          12% {
            opacity: 0.95;
          }
          30% {
            transform: translate(calc(var(--drift-x, 26px) * 0.4), calc(var(--travel-y, 180px) * 0.28)) rotate(-42deg);
          }
          60% {
            transform: translate(calc(var(--drift-x, 26px) * 0.1), calc(var(--travel-y, 180px) * 0.58)) rotate(-110deg);
          }
          85% {
            opacity: 0.85;
            transform: translate(calc(var(--drift-x, 26px) * 0.75), calc(var(--travel-y, 180px) * 0.88)) rotate(-180deg);
          }
          95% {
            opacity: 0.35;
          }
          100% {
            opacity: 0;
            transform: translate(var(--drift-x, 26px), var(--travel-y, 180px)) rotate(-240deg);
          }
        }

        .falling-petal-traj-1 {
          animation: petal-sway-drift-1 linear infinite;
          transform-box: fill-box;
          transform-origin: center;
        }

        .falling-petal-traj-2 {
          animation: petal-sway-drift-2 linear infinite;
          transform-box: fill-box;
          transform-origin: center;
        }

        .falling-petal-traj-3 {
          animation: petal-sway-drift-3 linear infinite;
          transform-box: fill-box;
          transform-origin: center;
        }

        .falling-petal-traj-4 {
          animation: petal-sway-drift-4 linear infinite;
          transform-box: fill-box;
          transform-origin: center;
        }

        @media (prefers-reduced-motion: reduce) {
          .falling-petal-item {
            animation: none !important;
            opacity: 0 !important;
          }
          .resting-petal-item {
            opacity: 0.85 !important;
          }
        }
      `}</style>

      {/* Resting petals near the ground (visible during still/reduced-motion too) */}
      <g className="resting-petals-layer">
        {RESTING_PETALS.map((petal) => (
          <use
            key={petal.id}
            href="#single-petal-shape"
            className="resting-petal-item"
            fill={petal.color}
            opacity="0.75"
            transform={`translate(${petal.x}, ${petal.y}) rotate(${petal.rotation}) scale(${petal.size})`}
          />
        ))}
      </g>

      {/* Falling petals layer */}
      <g className="falling-petals-layer">
        {FALLING_PETALS.map((petal) => {
          const travelY = 286 - petal.startY;
          const driftX = petal.swayType === 2 || petal.swayType === 4 ? 24 : 16;

          return (
            <g
              key={petal.id}
              className={`falling-petal-item falling-petal-traj-${petal.swayType}`}
              style={
                {
                  "--travel-y": `${travelY}px`,
                  "--drift-x": `${driftX}px`,
                  animationDuration: `${petal.speed}s`,
                  animationDelay: `${petal.delay}s`,
                } as React.CSSProperties
              }
            >
              <use
                href="#single-petal-shape"
                fill={petal.color}
                transform={`translate(${petal.startX}, ${petal.startY}) scale(${petal.size})`}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
