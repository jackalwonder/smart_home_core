from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ErrorDetailSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str | None = Field(default=None, description="Field name")
    message: str = Field(description="Detailed error message")


class ErrorResponseSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: str = Field(description="Application error code")
    message: str = Field(description="User-facing error message")
    code: int = Field(description="Business error code")
    timestamp: datetime = Field(description="Error timestamp")
    request_id: str = Field(description="Request identifier")
    details: list[ErrorDetailSchema] | None = Field(default=None, description="Validation details")
    path: str | None = Field(default=None, description="Request path")
