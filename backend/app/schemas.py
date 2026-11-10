from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RoleEnum(str, Enum):
    frontend = "frontend"
    backend = "backend"
    ai_ml = "ai_ml"
    security = "security"
    devops = "devops"


# User Schemas
class UserBase(BaseModel):
    username: str
    avatar_url: Optional[str] = None


class UserResponse(UserBase):
    id: int
    github_id: int

    model_config = ConfigDict(from_attributes=True)


# Auth Schemas
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Member Schemas
class MemberCreate(BaseModel):
    role: RoleEnum
    user_id: Optional[int] = None


class MemberUpdateRole(BaseModel):
    role: RoleEnum


class MemberResponse(BaseModel):
    id: int
    project_id: int
    user_id: int
    role: str
    username: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class NodeOwnerUpdate(BaseModel):
    owner_id: Optional[int] = None


# Project Schemas
class ProjectCreate(BaseModel):
    repo_owner: str = Field(..., min_length=1, max_length=255, description="GitHub repository owner/organization")
    repo_name: str = Field(..., min_length=1, max_length=255, description="GitHub repository name")
    owner_role: RoleEnum = Field(default=RoleEnum.backend, description="Role assigned to project creator")


class ProjectResponse(BaseModel):
    id: int
    owner_id: int
    repo_owner: str
    repo_name: str
    readme_text: Optional[str] = None
    webhook_secret: str
    plan_status: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Plan Schemas
class PlanNodeSchema(BaseModel):
    key: str = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="")
    role: RoleEnum
    done_criteria: str = Field(default="")
    path_hints: list[str] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_dependencies(cls, data: Any):
        if isinstance(data, dict):
            if "dependencies" in data and "depends_on" not in data:
                data["depends_on"] = data["dependencies"]
        return data


class PlanSchema(BaseModel):
    nodes: list[PlanNodeSchema]


class PlanApproveResponse(BaseModel):
    message: str = "Plan approved and tree activated"
    project_id: int
    nodes_created: int
    edges_created: int
    plan_status: str = "approved"


# Tree & Node Schemas
class EdgeSchema(BaseModel):
    id: int
    project_id: int
    from_node: int
    to_node: int
    state: str

    model_config = ConfigDict(from_attributes=True)


class NodeSchema(BaseModel):
    id: int
    project_id: int
    key: str
    title: str
    description: str
    role: str
    done_criteria: str
    path_hints: list[str] = Field(default_factory=list)
    status: str
    owner_id: Optional[int] = None
    done_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ProgressSchema(BaseModel):
    done: int
    total: int
    percentage: float


class TreeResponse(BaseModel):
    project_id: int
    nodes: list[NodeSchema]
    edges: list[EdgeSchema]
    progress: ProgressSchema
    last_event_id: int


class MatchedCommitDetail(BaseModel):
    commit_id: int
    sha: str
    message: str
    author_login: Optional[str] = None
    confidence: float
    method: str


class NodeOwnerInfo(BaseModel):
    id: int
    username: str
    avatar_url: Optional[str] = None


class AIDecisionInfo(BaseModel):
    verdict: str
    confidence: float
    reason: str


class NodeDetailResponse(BaseModel):
    node: NodeSchema
    title: str
    role: str
    status: str
    done_criteria: str
    owner: Optional[NodeOwnerInfo] = None
    commits: list[MatchedCommitDetail] = Field(default_factory=list)
    latest_ai_decision: Optional[AIDecisionInfo] = None


# Notification Schemas
class NotificationResponse(BaseModel):
    id: int
    user_id: int
    project_id: int
    message: str
    node_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Share Link & Viewer Schemas
class ShareLinkResponse(BaseModel):
    id: int
    project_id: int
    token: str
    revoked: bool
    created_at: datetime
    share_url: str

    model_config = ConfigDict(from_attributes=True)


class ViewerProjectInfo(BaseModel):
    id: int
    repo_owner: str
    repo_name: str
    plan_status: str
    status: str

    model_config = ConfigDict(from_attributes=True)


class ViewerTreeResponse(BaseModel):
    project: ViewerProjectInfo
    nodes: list[NodeSchema]
    edges: list[EdgeSchema]
