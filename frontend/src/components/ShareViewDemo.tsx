import React, { useState } from "react";

export const ShareViewDemo: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const sampleToken = "sec_vwr_9fa81bc330de45f8a09b2e7c1";
  const shareUrl = `http://localhost:8000/view/${sampleToken}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="border-b border-[#E5E2DC] bg-[#FBFBF9] py-16 px-6">
      <div className="max-w-7xl mx-auto text-left grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left column (6 cols) */}
        <div className="lg:col-span-6">
          <div className="text-sm font-semibold tracking-wide text-[#C2410C] mb-2">
            Secure Read-Only Viewer Links
          </div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-[#0E1013] mb-4">
            Stakeholder visibility without permission leakage.
          </h2>
          <p className="text-base text-[#57534E] leading-relaxed mb-6">
            Generate 32-byte cryptographically random viewer tokens. External collaborators or clients can monitor dependency progression in real time without creating accounts or viewing sensitive repository tokens, emails, or webhook secrets.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 px-3 py-2 text-xs bg-[#FFFFFF] border border-[#0E1013] text-[#57534E] font-mono rounded-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#FFFFFF] bg-[#0E1013] hover:bg-[#C2410C] transition-colors border border-[#000000] shadow-[2px_2px_0px_#C2410C] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none whitespace-nowrap"
            >
              {copied ? "Copied to Clipboard" : "Copy Viewer URL"}
            </button>
          </div>
        </div>

        {/* Right column: Security verification panel (6 cols) */}
        <div className="lg:col-span-6 border border-[#0E1013] bg-[#FFFFFF] p-6 shadow-[5px_5px_0px_#0E1013]">
          <h3 className="font-display font-bold text-base text-[#0E1013] mb-3">
            Viewer Token Isolation Invariants
          </h3>

          <ul className="text-xs text-[#57534E] space-y-3">
            <li className="flex items-start gap-2">
              <span className="w-4 h-4 bg-[#D1FAE5] border border-[#059669] text-[#047857] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                &#10003;
              </span>
              <span>
                <strong>Zero credential leakage:</strong> User email addresses, personal access tokens, and webhook secrets are strictly stripped before JSON serialisation.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-4 h-4 bg-[#D1FAE5] border border-[#059669] text-[#047857] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                &#10003;
              </span>
              <span>
                <strong>Immutable write isolation:</strong> Validated by integration tests proving a viewer token receives 401/403 when attempting to invoke any state modification endpoint.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-4 h-4 bg-[#D1FAE5] border border-[#059669] text-[#047857] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                &#10003;
              </span>
              <span>
                <strong>Instant revocation:</strong> Revoking a share link immediately returns 404 Not Found on subsequent requests.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
};
