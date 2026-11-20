"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, Github, Link2, Share2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Member, ProjectInvite, Role } from "@/lib/types";

type InviteTeammateModalProps = {
  projectId: number;
  isOpen: boolean;
  onClose: () => void;
  onInviteSent: (invite: ProjectInvite) => void;
  existingMembers: Member[];
  existingInvites: ProjectInvite[];
};

const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export function InviteTeammateModal({
  projectId,
  isOpen,
  onClose,
  onInviteSent,
  existingMembers,
  existingInvites,
}: InviteTeammateModalProps) {
  const [activeTab, setActiveTab] = useState<"username" | "link">("username");

  // Tab A states
  const [usernameInput, setUsernameInput] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role | "choose">("choose");
  const [usernameError, setUsernameError] = useState("");
  const [sendingUsername, setSendingUsername] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);

  // Tab B states
  const [linkRole, setLinkRole] = useState<Role | "choose">("choose");
  const [linkExpiry, setLinkExpiry] = useState<"24h" | "7d" | "30d">("7d");
  const [maxUses, setMaxUses] = useState<number>(5);
  const [creatingLink, setCreatingLink] = useState(false);
  const [generatedLinkInvite, setGeneratedLinkInvite] = useState<ProjectInvite | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Mentor link state
  const [creatingMentorLink, setCreatingMentorLink] = useState(false);
  const [mentorLink, setMentorLink] = useState<string | null>(null);
  const [copiedMentorLink, setCopiedMentorLink] = useState(false);

  // Ref for focus trap
  const modalRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Clean GitHub username
  const cleanUsername = usernameInput.replace(/^@/, "").trim();
  const isValidUsernameFormat = GITHUB_USERNAME_REGEX.test(cleanUsername);

  // Focus trap and ESC handler
  useEffect(() => {
    if (!isOpen) return;

    firstInputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            event.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            event.preventDefault();
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Validate GitHub username
  function validateUsername(): boolean {
    setUsernameError("");
    if (!cleanUsername) {
      setUsernameError("Please enter a GitHub username.");
      return false;
    }
    if (!isValidUsernameFormat) {
      setUsernameError("GitHub usernames can only contain letters, numbers, and single hyphens (max 39 characters).");
      return false;
    }

    const alreadyMember = existingMembers.some(
      (m) => m.username?.toLowerCase() === cleanUsername.toLowerCase()
    );
    if (alreadyMember) {
      setUsernameError(`@${cleanUsername} is already a member of this project.`);
      return false;
    }

    const alreadyInvited = existingInvites.some(
      (i) => i.status === "pending" && i.github_username?.toLowerCase() === cleanUsername.toLowerCase()
    );
    if (alreadyInvited) {
      setUsernameError(`An invite has already been sent to @${cleanUsername}.`);
      return false;
    }

    return true;
  }

  // Handle Tab A submit
  async function handleSendUsernameInvite(e: React.FormEvent) {
    e.preventDefault();
    if (isRateLimited || sendingUsername) return;
    if (!validateUsername()) return;

    setSendingUsername(true);
    setIsRateLimited(true);

    try {
      const invite = await api.createInvite(projectId, {
        type: "username",
        githubUsername: cleanUsername,
        role: selectedRole === "choose" ? null : selectedRole,
      });

      onInviteSent(invite);
      setUsernameInput("");
      setSelectedRole("choose");
      onClose();
    } catch (err: unknown) {
      setUsernameError(err instanceof Error ? err.message : "Failed to send invite.");
    } finally {
      setSendingUsername(false);
      // Rate-limit the button for 2 seconds
      setTimeout(() => setIsRateLimited(false), 2000);
    }
  }

  // Handle Tab B submit
  async function handleCreateLinkInvite() {
    if (creatingLink) return;
    setCreatingLink(true);

    try {
      const invite = await api.createInvite(projectId, {
        type: "link",
        role: linkRole === "choose" ? null : linkRole,
        expiresIn: linkExpiry,
        maxUses: Math.max(1, maxUses),
      });

      setGeneratedLinkInvite(invite);
      onInviteSent(invite);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create link.");
    } finally {
      setCreatingLink(false);
    }
  }

  // Copy helper
  async function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Native share
  async function shareLink(url: string) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join our CodeCanopy team",
          text: "Here is your invite link to join our project team on CodeCanopy.",
          url,
        });
      } catch {
        // User dismissed
      }
    }
  }

  // Revoke link from modal
  async function handleRevokeCurrentLink() {
    if (!generatedLinkInvite) return;
    try {
      await api.revokeInvite(generatedLinkInvite.id);
      setGeneratedLinkInvite(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to revoke link.");
    }
  }

  // Mentor link generator
  async function handleCreateMentorLink() {
    if (creatingMentorLink) return;
    setCreatingMentorLink(true);

    try {
      const invite = await api.createInvite(projectId, {
        type: "mentor",
        expiresIn: "30d",
      });
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      setMentorLink(`${baseUrl}/invite/${invite.token}`);
      onInviteSent(invite);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create mentor link.");
    } finally {
      setCreatingMentorLink(false);
    }
  }

  const originUrl = typeof window !== "undefined" ? window.location.origin : "";
  const inviteFullUrl = generatedLinkInvite ? `${originUrl}/invite/${generatedLinkInvite.token}` : "";

  return (
    <div aria-modal="true" className="invite-modal-overlay" role="dialog">
      <div className="invite-modal-backdrop" onClick={onClose} />
      <div className="invite-modal-card" ref={modalRef}>
        {/* Header */}
        <div className="invite-modal-header">
          <div>
            <h2 id="invite-dialog-title">Invite a teammate</h2>
            <p className="invite-modal-sub">Bring your collaborators into this project canopy.</p>
          </div>
          <button aria-label="Close invite dialog" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        {/* Tab switchers */}
        <div className="invite-tabs">
          <button
            className={`invite-tab-btn ${activeTab === "username" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("username");
              setUsernameError("");
            }}
            type="button"
          >
            <Github aria-hidden="true" size={16} />
            <span>Invite by GitHub username</span>
          </button>
          <button
            className={`invite-tab-btn ${activeTab === "link" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("link");
              setUsernameError("");
            }}
            type="button"
          >
            <Link2 aria-hidden="true" size={16} />
            <span>Share an invite link</span>
          </button>
        </div>

        {/* Tab A Content */}
        {activeTab === "username" && (
          <form className="invite-tab-content" onSubmit={handleSendUsernameInvite}>
            <div className="invite-form-group">
              <label htmlFor="github-username">GitHub username</label>
              <div className="username-input-wrapper">
                <span aria-hidden="true" className="input-at-prefix">
                  @
                </span>
                <input
                  autoComplete="off"
                  className="form-control with-prefix"
                  id="github-username"
                  onChange={(e) => {
                    setUsernameInput(e.target.value);
                    if (usernameError) setUsernameError("");
                  }}
                  placeholder="octocat"
                  ref={firstInputRef}
                  type="text"
                  value={usernameInput}
                />
              </div>

              {/* Live GitHub Preview Chip */}
              {cleanUsername && isValidUsernameFormat && (
                <div aria-live="polite" className="github-user-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt=""
                    className="avatar-small"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                    src={`https://github.com/${cleanUsername}.png?size=40`}
                  />
                  <div className="preview-info">
                    <span className="preview-login">@{cleanUsername}</span>
                    <span className="preview-source">GitHub account found</span>
                  </div>
                </div>
              )}

              {usernameError && (
                <p aria-live="assertive" className="error-message">
                  {usernameError}
                </p>
              )}
            </div>

            <div className="invite-form-group">
              <label htmlFor="assigned-role">Assign a role (optional)</label>
              <select
                className="form-control"
                id="assigned-role"
                onChange={(e) => setSelectedRole(e.target.value as Role | "choose")}
                value={selectedRole}
              >
                <option value="choose">Let them choose</option>
                <option value="frontend">Frontend</option>
                <option value="backend">Backend</option>
                <option value="ai_ml">AI / ML</option>
                <option value="security">Security</option>
                <option value="devops">DevOps</option>
              </select>
            </div>

            <div className="invite-modal-actions">
              <button className="secondary-button" onClick={onClose} type="button">
                Cancel
              </button>
              <button
                className="primary-button send-invite-btn"
                disabled={sendingUsername || isRateLimited || !cleanUsername}
                type="submit"
              >
                {sendingUsername ? "Sending invite..." : "Send invite"}
              </button>
            </div>
          </form>
        )}

        {/* Tab B Content */}
        {activeTab === "link" && (
          <div className="invite-tab-content">
            <p className="link-explainer">
              Anyone with this link who signs in with GitHub can join as a student.
            </p>

            {!generatedLinkInvite ? (
              <div className="create-link-controls">
                <div className="invite-form-row">
                  <div className="invite-form-group flex-1">
                    <label htmlFor="link-assigned-role">Assigned role</label>
                    <select
                      className="form-control"
                      id="link-assigned-role"
                      onChange={(e) => setLinkRole(e.target.value as Role | "choose")}
                      value={linkRole}
                    >
                      <option value="choose">Let them choose</option>
                      <option value="frontend">Frontend</option>
                      <option value="backend">Backend</option>
                      <option value="ai_ml">AI / ML</option>
                      <option value="security">Security</option>
                      <option value="devops">DevOps</option>
                    </select>
                  </div>

                  <div className="invite-form-group flex-1">
                    <label htmlFor="link-expiry">Link expiry</label>
                    <select
                      className="form-control"
                      id="link-expiry"
                      onChange={(e) => setLinkExpiry(e.target.value as "24h" | "7d" | "30d")}
                      value={linkExpiry}
                    >
                      <option value="24h">24 hours</option>
                      <option value="7d">7 days (default)</option>
                      <option value="30d">30 days</option>
                    </select>
                  </div>

                  <div className="invite-form-group width-100">
                    <label htmlFor="link-max-uses">Max uses</label>
                    <input
                      className="form-control"
                      id="link-max-uses"
                      max={8}
                      min={1}
                      onChange={(e) => setMaxUses(Number(e.target.value))}
                      type="number"
                      value={maxUses}
                    />
                  </div>
                </div>

                <div className="invite-modal-actions">
                  <button className="secondary-button" onClick={onClose} type="button">
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    disabled={creatingLink}
                    onClick={handleCreateLinkInvite}
                    type="button"
                  >
                    {creatingLink ? "Creating link..." : "Create link"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="active-link-box">
                <label htmlFor="generated-link">Your student invite link:</label>
                <div className="link-copy-field">
                  <input
                    aria-label="Generated invite link"
                    className="form-control link-input"
                    id="generated-link"
                    readOnly
                    value={inviteFullUrl}
                  />
                  <button
                    className={`copy-link-btn ${copiedLink ? "copied" : ""}`}
                    onClick={() => copyToClipboard(inviteFullUrl, setCopiedLink)}
                    type="button"
                  >
                    {copiedLink ? (
                      <>
                        <Check aria-hidden="true" size={14} /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy aria-hidden="true" size={14} /> Copy
                      </>
                    )}
                  </button>
                  {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                    <button
                      aria-label="Share invite link"
                      className="share-link-btn"
                      onClick={() => shareLink(inviteFullUrl)}
                      type="button"
                    >
                      <Share2 aria-hidden="true" size={15} />
                    </button>
                  )}
                </div>

                <div className="link-meta-row">
                  <span>
                    Expires in {linkExpiry === "24h" ? "24 hours" : linkExpiry === "7d" ? "7 days" : "30 days"} •{" "}
                    {generatedLinkInvite.max_uses ?? 5} uses remaining
                  </span>
                  <button className="text-button text-danger" onClick={handleRevokeCurrentLink} type="button">
                    Revoke link
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Third Option: Mentor Invite */}
        <div className="mentor-invite-section">
          <div className="mentor-section-left">
            <div className="mentor-icon-bubble">
              <Eye aria-hidden="true" size={16} />
            </div>
            <div>
              <strong>Invite a mentor (view only)</strong>
              <p>Mentors can watch the tree but can&apos;t change anything.</p>
            </div>
          </div>
          <div className="mentor-section-right">
            {!mentorLink ? (
              <button
                className="secondary-button compact-btn"
                disabled={creatingMentorLink}
                onClick={handleCreateMentorLink}
                type="button"
              >
                {creatingMentorLink ? "Creating..." : "Create mentor link"}
              </button>
            ) : (
              <button
                className={`secondary-button compact-btn ${copiedMentorLink ? "copied-btn" : ""}`}
                onClick={() => copyToClipboard(mentorLink, setCopiedMentorLink)}
                type="button"
              >
                {copiedMentorLink ? (
                  <>
                    <Check aria-hidden="true" size={13} /> Copied!
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" size={13} /> Copy mentor link
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
