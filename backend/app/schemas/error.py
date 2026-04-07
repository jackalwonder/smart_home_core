"""统一的错误响应模式定义。"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ErrorDetailSchema(BaseModel):
    """错误附加信息。"""

    model_config = ConfigDict(extra="forbid")

    field: str | None = Field(default=None, description="出错字段名")
    message: str = Field(description="详细错误信息")


class ErrorResponseSchema(BaseModel):
    """统一的错误响应格式。"""

    model_config = ConfigDict(extra="forbid")

    error: str = Field(description="错误代码（如：resource_not_found，user_unauthorized）")
    message: str = Field(description="用户友好的错误消息")
    code: int = Field(description="业务错误代码（4位数字，11xx-19xx）")
    timestamp: datetime = Field(description="错误发生时间")
    request_id: str = Field(description="请求追踪ID")
    details: list[ErrorDetailSchema] | None = Field(default=None, description="错误详情列表")
    path: str | None = Field(default=None, description="出错的API路径")

    class Config:
        json_schema_extra = {
            "example": {
                "error": "device_not_found",
                "message": "设备不存在或已被删除",
                "code": 1404,
                "timestamp": "2024-04-07T10:30:00.123456Z",
                "request_id": "req-abc-123-def",
                "details": [{"field": "device_id", "message": "设备ID无效"}],
                "path": "/api/v1/device/999",
            }
        }
