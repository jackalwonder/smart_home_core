"""向后兼容的错误模块 - 新异常定义已移至 exceptions.py"""

from __future__ import annotations

# 导入新的异常系统，保持向后兼容
from app.services.exceptions import (
    ConflictError,
    ConfigurationError,
    ExternalServiceError,
    NotFoundError,
    ResourceNotFoundError,
    ServiceConfigurationError,
    ExternalServiceUnavailableError,
    SmartHomeException,
    UnauthorizedError,
    PermissionDeniedError,
    ValidationError,
    InvalidStateError,
    DependencyError,
    RateLimitError,
    OperationTimeoutError,
)

__all__ = [
    "SmartHomeException",
    "ConflictError",
    "NotFoundError",
    "ResourceNotFoundError",
    "ConfigurationError",
    "ServiceConfigurationError",
    "ExternalServiceError",
    "ExternalServiceUnavailableError",
    "UnauthorizedError",
    "PermissionDeniedError",
    "ValidationError",
    "InvalidStateError",
    "DependencyError",
    "RateLimitError",
    "OperationTimeoutError",
]
