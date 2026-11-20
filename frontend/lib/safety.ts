/**
 * Safety utilities for rendering text extracted from repositories / READMEs
 * and user-supplied notes.
 */

const SECRET_PATTERNS: RegExp[] = [
  // GitHub tokens (ghp, gho, ghu, ghs, ghr)
  /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/g,
  // Generic API keys or sk- tokens (OpenAI, Stripe, etc.)
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  // AWS Access Key IDs
  /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
  // Google API keys
  /\bAIza[0-9A-Za-z-_]{35}\b/g,
  // Bearer tokens in headers or docs
  /(Bearer\s+)[A-Za-z0-9._~+/-]{15,}/gi,
  // Common key/token assignments
  /\b(password|secret|token|api_key|apikey|private_key)\s*[:=]\s*["']?[A-Za-z0-9!@#$%^&*()_+=-]{8,}["']?/gi,
];

/**
 * Masks potential secrets or tokens in raw text before display.
 */
export function maskSecrets(text: string): string {
  if (!text) return "";
  let sanitized = text;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match, prefix) => {
      if (prefix && match.startsWith(prefix)) {
        return `${prefix}[hidden]`;
      }
      if (match.includes("=")) {
        const key = match.split("=")[0];
        return `${key}=[hidden]`;
      }
      if (match.includes(":")) {
        const key = match.split(":")[0];
        return `${key}: [hidden]`;
      }
      return "[hidden]";
    });
  }
  return sanitized;
}

/**
 * Strips any potential script or HTML tags and returns clean plain text.
 */
export function sanitizePlainText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .trim();
}
