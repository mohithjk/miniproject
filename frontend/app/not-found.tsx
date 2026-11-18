import Link from "next/link";
import { ArrowLeft, Compass, Sprout } from "lucide-react";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <header className="dashboard-header">
        <Brand />
        <Link className="back-link" href="/dashboard">
          <ArrowLeft aria-hidden="true" size={16} /> Back to dashboard
        </Link>
      </header>

      <section className="not-found-content">
        <div className="not-found-card">
          <span className="not-found-icon" aria-hidden="true">
            <Sprout size={36} />
          </span>
          <p className="eyebrow">404 · Branch not found</p>
          <h1>This branch hasn&apos;t grown yet.</h1>
          <p className="not-found-description">
            The page you&apos;re looking for might have been moved, pruned, or hasn&apos;t sprouted yet.
            Let&apos;s get you back to your workspace.
          </p>
          <div className="not-found-actions">
            <Link className="primary-button" href="/dashboard">
              <Compass aria-hidden="true" size={17} />
              Return to dashboard
            </Link>
            <Link className="secondary-button" href="/login">
              Sign in page
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
