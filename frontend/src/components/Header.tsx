import React from "react";

export const Header: React.FC = () => {
  return (
    <header className="border-b border-[#E5E2DC] bg-[#FFFFFF] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
        {/* Brand identity: Custom geometric node symbol + Brand Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#C2410C] flex items-center justify-center text-[#FFFFFF] font-display font-bold text-lg shadow-[2px_2px_0px_#000000]">
            {/* Custom SVG DAG glyph */}
            <svg
              className="w-5 h-5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="square"
            >
              <rect x="3" y="3" width="6" height="6" fill="#FFFFFF" stroke="#000000" />
              <rect x="15" y="3" width="6" height="6" fill="#FFFFFF" stroke="#000000" />
              <rect x="9" y="15" width="6" height="6" fill="#FFFFFF" stroke="#000000" />
              <path d="M6 9v3h6v3" />
              <path d="M18 9v3h-6" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-xl tracking-tight text-[#0E1013]">
              Cadence
            </span>
            <span className="text-xs text-[#78716C] -mt-1 font-medium">
              Autonomous Git Dependency Coordinator
            </span>
          </div>
        </div>

        {/* System telemetry bar */}
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-4 text-xs font-medium text-[#57534E]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-none bg-[#059669] inline-block animate-pulse" />
              <span>Queue: SKIP LOCKED (0 pending)</span>
            </div>
            <span className="text-[#E5E2DC]">|</span>
            <span>Audit: 42/42 Verified</span>
          </div>

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#0E1013] bg-[#F4F3EF] border border-[#0E1013] hover:bg-[#C2410C] hover:text-[#FFFFFF] transition-colors shadow-[2px_2px_0px_#0E1013] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Connect Repository
          </a>
        </div>
      </div>
    </header>
  );
};
