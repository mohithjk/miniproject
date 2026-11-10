import React from "react";

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-[#E5E2DC] bg-[#0E1013] text-[#FFFFFF] py-14 px-6 text-left">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 items-start">
        {/* Brand summary (5 cols) */}
        <div className="md:col-span-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 bg-[#C2410C] flex items-center justify-center font-display font-bold text-xs text-white">
              C
            </span>
            <span className="font-display font-bold text-lg text-white">
              Cadence Engine
            </span>
          </div>
          <p className="text-xs text-[#78716C] leading-relaxed max-w-sm mb-4">
            Autonomous dependency graph coordinator for engineering teams. Synchronises pull requests, verifies satisfaction criteria, and advances blocked work across roles automatically.
          </p>
          <div className="text-[11px] text-[#57534E]">
            Built with FastAPI 0.115, PostgreSQL 16, and SQLAlchemy 2.0.
          </div>
        </div>

        {/* Quickstart Terminal Reference (7 cols) */}
        <div className="md:col-span-7 bg-[#000000] border border-[#57534E] p-4 shadow-[4px_4px_0px_#C2410C]">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#334155] text-xs text-[#78716C]">
            <span className="font-mono font-bold text-[#E5E2DC]">LOCAL TERMINAL QUICKSTART</span>
            <span>v1.0.0</span>
          </div>

          <div className="font-mono text-xs text-[#FBFBF9] space-y-2">
            <div>
              <span className="text-[#059669]">$</span> git clone &amp;&amp; cd miniproject/backend
            </div>
            <div>
              <span className="text-[#059669]">$</span> cp .env.example .env
            </div>
            <div>
              <span className="text-[#059669]">$</span> docker compose up --build
              <span className="text-[#78716C] ml-2"># Launches api, worker, and postgres with auto-migrations</span>
            </div>
            <div>
              <span className="text-[#059669]">$</span> pytest -v
              <span className="text-[#059669] ml-2"># 53 passing tests</span>
            </div>
            <div>
              <span className="text-[#059669]">$</span> python ../scripts/replay_webhooks.py --secret &lt;TOKEN&gt;
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-[#334155] flex flex-col sm:flex-row items-center justify-between text-xs text-[#78716C] gap-4">
        <div>
          &copy; 2026 Cadence Engineering. Deterministic Git Workflow Coordination.
        </div>
        <div className="flex gap-6">
          <span className="hover:text-white transition-colors cursor-pointer">Documentation</span>
          <span className="hover:text-white transition-colors cursor-pointer">API Schema</span>
          <span className="hover:text-white transition-colors cursor-pointer">Security Model</span>
        </div>
      </div>
    </footer>
  );
};
