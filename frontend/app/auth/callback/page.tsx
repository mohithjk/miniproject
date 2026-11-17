"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api";
import { saveSession } from "@/lib/session";

export default function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    window.history.replaceState({}, document.title, window.location.pathname);
    if (!code) {
      setError(searchParams.get("error_description") || "GitHub did not return a sign-in code.");
      return;
    }

    api.exchangeGithubCode(code)
      .then(({ access_token, user }) => {
        saveSession(access_token, user);
        router.replace("/dashboard");
      })
      .catch((callbackError: unknown) => {
        setError(callbackError instanceof Error ? callbackError.message : "Could not finish GitHub sign-in.");
      });
  }, [router]);

  return (
    <main className="callback-page">
      <div className="callback-card">
        <Brand />
        {error ? (
          <>
            <h1>We couldn&apos;t connect your GitHub.</h1>
            <p className="error-message" role="alert">{error}</p>
            <Link className="text-link" href="/login">Back to login</Link>
          </>
        ) : (
          <>
            <span className="spinner callback-spinner" />
            <h1>Connecting your GitHub...</h1>
            <p>Just a moment while we set up your workspace.</p>
          </>
        )}
      </div>
    </main>
  );
}
