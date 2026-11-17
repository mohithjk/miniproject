import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Sprout } from "lucide-react";
import type { Project } from "@/lib/types";

type ProjectListProps = {
  projects: Project[];
};

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="empty-projects">
        <span className="empty-icon"><Sprout aria-hidden="true" size={24} /></span>
        <h2>Your canopy is ready to grow</h2>
        <p>Connect a GitHub repository and CodeCanopy will start mapping the work ahead.</p>
      </div>
    );
  }

  return (
    <div className="project-grid">
      {projects.map((project) => (
        <Link
          className="project-card"
          href={project.plan_status === "approved" ? `/projects/${project.id}/tree` : `/projects/${project.id}/plan`}
          key={project.id}
        >
          <div className="project-card-top">
            <span className="repo-icon"><Sprout aria-hidden="true" size={18} /></span>
            <ArrowUpRight aria-hidden="true" className="project-arrow" size={18} />
          </div>
          <p className="repo-owner">{project.repo_owner}</p>
          <h2>{project.repo_name}</h2>
          <div className="project-meta">
            <span className={`status-pill status-${project.status}`}>{project.status.replace("_", " ")}</span>
            <span>{project.plan_status === "approved" ? "Plan approved" : "Plan in progress"}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
