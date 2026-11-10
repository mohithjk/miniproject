from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# Postgres types with SQLite fallback for local test flexibility
PG_JSON = JSONB().with_variant(JSON, "sqlite")
PG_ARRAY_STR = ARRAY(String).with_variant(JSON, "sqlite")


class User(Base):
    """User account linked via GitHub."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    github_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    gh_token_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    projects_owned: Mapped[list["Project"]] = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    memberships: Mapped[list["Member"]] = relationship("Member", back_populates="user", cascade="all, delete-orphan")
    notifications: Mapped[list["Notification"]] = relationship("Notification", back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    """A connected GitHub repository under coordination."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    repo_owner: Mapped[str] = mapped_column(String(255), nullable=False)
    repo_name: Mapped[str] = mapped_column(String(255), nullable=False)
    readme_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    webhook_secret: Mapped[str] = mapped_column(String(255), nullable=False)
    plan_status: Mapped[str] = mapped_column(String(50), default="draft", nullable=False)  # draft | approved
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)  # active | completed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("repo_owner", "repo_name", name="uq_projects_repo_owner_repo_name"),
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="projects_owned")
    members: Mapped[list["Member"]] = relationship("Member", back_populates="project", cascade="all, delete-orphan")
    nodes: Mapped[list["Node"]] = relationship("Node", back_populates="project", cascade="all, delete-orphan")
    edges: Mapped[list["Edge"]] = relationship("Edge", back_populates="project", cascade="all, delete-orphan")
    commits: Mapped[list["Commit"]] = relationship("Commit", back_populates="project", cascade="all, delete-orphan")
    events: Mapped[list["Event"]] = relationship("Event", back_populates="project", cascade="all, delete-orphan")
    share_links: Mapped[list["ShareLink"]] = relationship("ShareLink", back_populates="project", cascade="all, delete-orphan")
    notifications: Mapped[list["Notification"]] = relationship("Notification", back_populates="project", cascade="all, delete-orphan")


class Member(Base):
    """Team member working on a project with a designated role."""

    __tablename__ = "members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # frontend, backend, ai_ml, security, devops

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_members_project_user"),
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="memberships")


class Node(Base):
    """A unit of work inside the project dependency tree."""

    __tablename__ = "nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    key: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "n1"
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # frontend, backend, ai_ml, security, devops
    done_criteria: Mapped[str] = mapped_column(Text, default="", nullable=False)
    path_hints: Mapped[list[str]] = mapped_column(PG_ARRAY_STR, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="locked", nullable=False)  # locked|ready|in_progress|done
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    done_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("project_id", "key", name="uq_nodes_project_key"),
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="nodes")
    owner: Mapped[Optional["User"]] = relationship("User")
    incoming_edges: Mapped[list["Edge"]] = relationship(
        "Edge",
        foreign_keys="Edge.to_node",
        back_populates="target_node",
        cascade="all, delete-orphan",
    )
    outgoing_edges: Mapped[list["Edge"]] = relationship(
        "Edge",
        foreign_keys="Edge.from_node",
        back_populates="source_node",
        cascade="all, delete-orphan",
    )
    node_commits: Mapped[list["NodeCommit"]] = relationship(
        "NodeCommit",
        back_populates="node",
        cascade="all, delete-orphan",
    )


class Edge(Base):
    """Directed dependency edge between two nodes."""

    __tablename__ = "edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    from_node: Mapped[int] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    to_node: Mapped[int] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    state: Mapped[str] = mapped_column(String(50), default="hidden", nullable=False)  # hidden|dotted|solid

    __table_args__ = (
        UniqueConstraint("from_node", "to_node", name="uq_edges_from_to"),
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="edges")
    source_node: Mapped["Node"] = relationship("Node", foreign_keys=[from_node], back_populates="outgoing_edges")
    target_node: Mapped["Node"] = relationship("Node", foreign_keys=[to_node], back_populates="incoming_edges")


class Commit(Base):
    """Git commit recorded from push webhooks."""

    __tablename__ = "commits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    sha: Mapped[str] = mapped_column(String(40), nullable=False)
    author_login: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    files: Mapped[list[Any]] = mapped_column(PG_JSON, default=list, nullable=False)
    committed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("project_id", "sha", name="uq_commits_project_sha"),
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="commits")
    node_commits: Mapped[list["NodeCommit"]] = relationship(
        "NodeCommit",
        back_populates="commit",
        cascade="all, delete-orphan",
    )


class NodeCommit(Base):
    """Association between a Node and a Commit with match metadata."""

    __tablename__ = "node_commits"

    node_id: Mapped[int] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True)
    commit_id: Mapped[int] = mapped_column(ForeignKey("commits.id", ondelete="CASCADE"), primary_key=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    method: Mapped[str] = mapped_column(String(50), nullable=False)  # tag|path|llm|manual

    # Relationships
    node: Mapped["Node"] = relationship("Node", back_populates="node_commits")
    commit: Mapped["Commit"] = relationship("Commit", back_populates="node_commits")


class Event(Base):
    """Append-only audit log for coordination and project events."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(PG_JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="events")


class WebhookDelivery(Base):
    """Deduplication record for incoming GitHub webhook delivery IDs."""

    __tablename__ = "webhook_deliveries"

    delivery_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Job(Base):
    """Asynchronous job queue table processed by the worker."""

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(100), nullable=False)  # plan | match | judge
    payload: Mapped[dict[str, Any]] = mapped_column(PG_JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)  # pending|running|done|failed
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Notification(Base):
    """User notifications when nodes unlock or actions are required."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    node_id: Mapped[Optional[int]] = mapped_column(ForeignKey("nodes.id", ondelete="SET NULL"), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="notifications")
    project: Mapped["Project"] = relationship("Project", back_populates="notifications")
    node: Mapped[Optional["Node"]] = relationship("Node")


class ShareLink(Base):
    """Read-only viewer links for mentors to watch tree progress."""

    __tablename__ = "share_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="share_links")
