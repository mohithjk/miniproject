"use client";

import { useState } from "react";
import { Copy, Link2, Share2, X } from "lucide-react";
import { api } from "@/lib/api";

type ShareControlsProps = {
  projectId: number;
};

export function ShareControls({ projectId }: ShareControlsProps) {
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function createLink() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const link = await api.createShareLink(projectId);
      setShareUrl(new URL(link.share_url, window.location.origin).toString());
      setMessage("Viewer link created. Share it only with people you trust.");
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : "Could not create a viewer link.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setError("");
      setMessage("Viewer link copied.");
    } catch {
      setError("Could not copy automatically. Select and copy the link above.");
    }
  }

  async function revokeLinks() {
    if (!window.confirm("Revoke active viewer links for this project? Anyone using them will lose access.")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.revokeShareLink(projectId, shareUrl ? new URL(shareUrl).pathname.split("/").pop() : undefined);
      setShareUrl("");
      setMessage("Active viewer link(s) revoked.");
    } catch (revokeError: unknown) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke viewer links.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-controls">
      <button
        aria-expanded={open}
        className="share-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Share2 aria-hidden="true" size={15} />
        <span>Share viewer</span>
      </button>
      {open && (
        <section aria-label="Share read-only project tree" className="share-popover">
          <div className="share-heading">
            <div>
              <p className="eyebrow">Read-only access</p>
              <h2>Share this tree</h2>
            </div>
            <button aria-label="Close sharing panel" className="icon-button" onClick={() => setOpen(false)} type="button">
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <p className="share-description">Anyone with the link can view project progress without signing in.</p>
          {shareUrl && (
            <div className="share-url-row">
              <Link2 aria-hidden="true" size={15} />
              <input aria-label="Viewer link" className="form-control" readOnly value={shareUrl} />
              <button aria-label="Copy viewer link" className="mark-read-button" onClick={() => void copyLink()} title="Copy link" type="button">
                <Copy aria-hidden="true" size={15} />
              </button>
            </div>
          )}
          {error && <p className="notification-error" role="alert">{error}</p>}
          {message && <p className="share-success" role="status">{message}</p>}
          <div className="share-actions">
            <button className="primary-button" disabled={busy} onClick={() => void createLink()} type="button">
              {busy ? "Working..." : shareUrl ? "Create another link" : "Create viewer link"}
            </button>
            <button className="secondary-button" disabled={busy} onClick={() => void revokeLinks()} type="button">
              Revoke active links
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
