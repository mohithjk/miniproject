import React from "react";

export const TechnicalSpecsTable: React.FC = () => {
  return (
    <section className="border-b border-[#E5E2DC] bg-[#FFFFFF] py-16 px-6">
      <div className="max-w-7xl mx-auto text-left">
        <div className="text-sm font-semibold tracking-wide text-[#C2410C] mb-2">
          Architectural Blueprint
        </div>
        <h2 className="font-display font-bold text-3xl sm:text-4xl text-[#0E1013] mb-4">
          Engineered for deterministic concurrency and cryptographic verification.
        </h2>
        <p className="text-base text-[#57534E] max-w-3xl mb-10">
          Cadence removes subjective coordination by pairing raw webhook cryptography with transactional state machines. Every decision and lock transition is auditable in PostgreSQL.
        </p>

        {/* Asymmetric Technical Grid (not identical 3-card layout) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Item 1: Concurrency (7 cols) */}
          <div className="md:col-span-7 border border-[#0E1013] bg-[#FBFBF9] p-6 shadow-[4px_4px_0px_#0E1013]">
            <div className="flex items-center justify-between mb-3 border-b border-[#E5E2DC] pb-2">
              <span className="font-display font-bold text-base text-[#0E1013]">
                Distributed Worker Concurrency
              </span>
              <span className="text-xs font-mono font-bold bg-[#E5E2DC] px-2 py-0.5">
                SKIP LOCKED
              </span>
            </div>
            <p className="text-sm text-[#57534E] leading-relaxed mb-4">
              Background job dispatch utilizes PostgreSQL <code className="bg-[#FFFFFF] px-1 py-0.5 border border-[#E5E2DC] text-[#C2410C]">SELECT ... FOR UPDATE SKIP LOCKED</code>. Multiple worker instances dequeue jobs without lock contention or deadlocks, automatically retrying up to 3 attempts before logging a failed event.
            </p>
            <div className="text-xs font-mono bg-[#FFFFFF] p-3 border border-[#E5E2DC] text-[#0E1013] space-y-1">
              <div>&gt; jobs.fetch_and_lock_next_job(db)</div>
              <div>&gt; with_for_update(skip_locked=True)</div>
              <div className="text-[#059669]">&gt; Status: 0 contention on concurrent webhook ingestion</div>
            </div>
          </div>

          {/* Item 2: Cryptography & Ingress (5 cols) */}
          <div className="md:col-span-5 border border-[#0E1013] bg-[#FBFBF9] p-6 shadow-[4px_4px_0px_#C2410C]">
            <div className="flex items-center justify-between mb-3 border-b border-[#E5E2DC] pb-2">
              <span className="font-display font-bold text-base text-[#0E1013]">
                Ingress Signature Gate
              </span>
              <span className="text-xs font-mono font-bold bg-[#FFEDD5] text-[#C2410C] px-2 py-0.5 border border-[#C2410C]">
                HMAC-SHA256
              </span>
            </div>
            <p className="text-sm text-[#57534E] leading-relaxed mb-4">
              Incoming GitHub payloads are digested against per-project secrets using constant-time comparison (<code className="bg-[#FFFFFF] px-1 py-0.5 border border-[#E5E2DC]">hmac.compare_digest</code>). Duplicate webhook delivery IDs (<code className="bg-[#FFFFFF] px-1 py-0.5 border border-[#E5E2DC]">X-GitHub-Delivery</code>) are tracked and deduplicated.
            </p>
            <div className="text-xs text-[#78716C] border-t border-[#E5E2DC] pt-2">
              GitHub tokens are stored encrypted at rest with Fernet symmetric cryptography.
            </div>
          </div>

          {/* Item 3: DAG Integrity (4 cols) */}
          <div className="md:col-span-4 border border-[#0E1013] bg-[#FBFBF9] p-6 shadow-[4px_4px_0px_#0E1013]">
            <div className="flex items-center justify-between mb-3 border-b border-[#E5E2DC] pb-2">
              <span className="font-display font-bold text-base text-[#0E1013]">
                Graph Validation
              </span>
              <span className="text-xs font-mono font-bold bg-[#E5E2DC] px-2 py-0.5">
                TopologicalSorter
              </span>
            </div>
            <p className="text-xs text-[#57534E] leading-relaxed">
              Every plan modification executes cyclical dependency validation using the Python standard library graph engine. Rejects circular chains, duplicate keys, unrecognised roles, and enforces strict bounds of 3 to 40 nodes per project.
            </p>
          </div>

          {/* Item 4: Scoring Algorithm (8 cols) */}
          <div className="md:col-span-8 border border-[#0E1013] bg-[#FFFFFF] p-6 shadow-[4px_4px_0px_#0E1013]">
            <div className="flex items-center justify-between mb-3 border-b border-[#E5E2DC] pb-2">
              <span className="font-display font-bold text-base text-[#0E1013]">
                Deterministic Decision Matrix
              </span>
              <span className="text-xs font-mono font-bold text-[#059669] bg-[#D1FAE5] px-2 py-0.5 border border-[#059669]">
                Rule 4 Verified
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-left">
              <div className="p-3 bg-[#F4F3EF] border border-[#E5E2DC]">
                <span className="text-xs font-bold block text-[#0E1013] mb-1">0.50 Weight</span>
                <span className="text-xs text-[#57534E]">Pull Request Merged</span>
              </div>
              <div className="p-3 bg-[#F4F3EF] border border-[#E5E2DC]">
                <span className="text-xs font-bold block text-[#0E1013] mb-1">0.20 Weight</span>
                <span className="text-xs text-[#57534E]">CI Workflow Success</span>
              </div>
              <div className="p-3 bg-[#F4F3EF] border border-[#E5E2DC]">
                <span className="text-xs font-bold block text-[#0E1013] mb-1">0.15 Weight</span>
                <span className="text-xs text-[#57534E]">Path Hints Present</span>
              </div>
              <div className="p-3 bg-[#F4F3EF] border border-[#E5E2DC]">
                <span className="text-xs font-bold block text-[#0E1013] mb-1">0.15 &times; Conf</span>
                <span className="text-xs text-[#57534E]">AI Criteria Verdict</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
