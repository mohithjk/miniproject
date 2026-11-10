import React, { useState } from "react";

interface HeroProps {
  onSimulatePush: () => void;
  isSimulating: boolean;
}

export const Hero: React.FC<HeroProps> = ({ onSimulatePush, isSimulating }) => {
  const [repoInput, setRepoInput] = useState("cadence-org/core-pipeline");

  return (
    <section className="border-b border-[#E5E2DC] bg-[#FFFFFF] py-16 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left-aligned Asymmetric Content (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-start text-left">
          <div className="text-sm font-semibold tracking-wide text-[#C2410C] mb-4">
            Autonomous Dependency Progression for Multi-Role Git Teams
          </div>

          <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-[#0E1013] leading-[1.08] tracking-tight mb-6">
            Directed graphs that activate when your commits land.
          </h1>

          <p className="text-lg text-[#57534E] leading-relaxed mb-8 max-w-2xl font-normal">
            Cadence evaluates incoming GitHub webhooks against a validated 3 to 40 node dependency tree.
            When team members commit changes matching explicit tags or path hints, downstream tasks
            for frontend, backend, security, and devops transition automatically in single atomic transactions.
          </p>

          {/* Repository connection box */}
          <div className="w-full max-w-xl p-4 bg-[#F4F3EF] border border-[#E5E2DC] shadow-[4px_4px_0px_#0E1013] mb-6">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0E1013] mb-2">
              Connect Target GitHub Repository
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="owner/repo"
                className="flex-1 px-3 py-2 text-sm bg-[#FFFFFF] border border-[#0E1013] text-[#0E1013] focus:outline-none focus:ring-2 focus:ring-[#C2410C] rounded-none font-medium"
              />
              <button
                type="button"
                onClick={onSimulatePush}
                disabled={isSimulating}
                className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-[#FFFFFF] bg-[#C2410C] border border-[#000000] hover:bg-[#9A3412] disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none whitespace-nowrap"
              >
                {isSimulating ? "Replaying Commit..." : "Simulate Signed Commit"}
              </button>
            </div>
            <div className="mt-2 text-xs text-[#78716C]">
              Webhook signatures are verified using HMAC-SHA256 with per-project secrets.
            </div>
          </div>
        </div>

        {/* Right side asymmetric specification card (5 cols) */}
        <div className="lg:col-span-5 border border-[#0E1013] bg-[#FBFBF9] p-6 shadow-[6px_6px_0px_#C2410C]">
          <h2 className="font-display font-bold text-xl text-[#0E1013] mb-4">
            Active DAG Execution Pipeline
          </h2>

          <div className="space-y-4 text-xs">
            <div className="border-b border-[#E5E2DC] pb-3">
              <span className="font-semibold text-[#0E1013] block mb-1">
                Evaluation Scoring Matrix
              </span>
              <p className="text-[#57534E] leading-normal">
                Score = 0.50 (PR merged) + 0.20 (CI workflow passed) + 0.15 (path hints matched) + 0.15 (AI judge confidence).
              </p>
            </div>

            <div className="border-b border-[#E5E2DC] pb-3">
              <span className="font-semibold text-[#0E1013] block mb-1">
                Threshold Decisions
              </span>
              <ul className="text-[#57534E] space-y-1">
                <li>• Score ≥ 0.80: Cascades completion &amp; activates ready children.</li>
                <li>• 0.50 ≤ Score &lt; 0.80: Creates review notification for role owner.</li>
                <li>• Score &lt; 0.50: Remains in progress until criteria are satisfied.</li>
              </ul>
            </div>

            <div className="pt-1">
              <span className="font-semibold text-[#0E1013] block mb-1">
                Single Transaction Idempotency
              </span>
              <p className="text-[#57534E] leading-normal">
                Multi-parent nodes activate only when all parent tasks reach completed state. Incoming edges update from dotted to solid atomically.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
