"""扩展的异常体系，包含完整的业务异常分类。"""

from __future__ import annotations

from typing import Any


class SmartHomeException(Exception):
    """所有自定义异常的基类。"""

    def __init__(self, message: str, error_code: str | None = None, http_status: int | None = None, details: dict[str, Any] | None = None):
        """初始化异常。

        Args:
            message: 用户友好的错误消息
            error_code: 错误代码 (如 'resource_not_found')
            http_status: HTTP状态码
            details: 附加错误详情字典
        """
        super().__init__(message)
        self.message = message
        self.error_code = error_code or self.__class__.__name__
        self.http_status = http_status or 500
        self.details = details or {}
        # 业务错误代码 (11xx-19xx)
        self.business_code = 1000 + http_status % 1000


class ValidationError(SmartHomeException):
    """数据验证失败异常。"""

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message, error_code="validation_error", http_status=422, details=details)


class ResourceNotFoundError(SmartHomeException):
    """资源不存在异常。"""

    def __init__(self, resource_type: str, resource_id: str | int):
        message = f"{resource_type}不存在或已被删除"
        details = {"resource_type": resource_type, "resource_id": str(resource_id)}
        super().__init__(message, error_code="resource_not_found", http_status=404, details=details)


class UnauthorizedError(SmartHomeException):
    """用户未授权异常。"""

    def __init__(self, message: str = "用户未授权"):
        super().__init__(message, error_code="unauthorized", http_status=401)


class PermissionDeniedError(SmartHomeException):
    """权限不足异常。"""

    def __init__(self, message: str = "权限不足，无法执行此操作"):
        super().__init__(message, error_code="permission_denied", http_status=403)


class ConflictError(SmartHomeException):
    """资源冲突异常（如重复创建）。"""

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message, error_code="conflict", http_status=409, details=details)


class RateLimitError(SmartHomeException):
    """超过速率限制异常。"""

    def __init__(self, message: str = "请求过于频繁，请稍后重试"):
        super().__init__(message, error_code="rate_limit_exceeded", http_status=429)


class ServiceConfigurationError(SmartHomeException):
    """服务配置缺失或错误。"""

    def __init__(self, service_name: str, message: str):
        full_message = f"服务配置错误 ({service_name}): {message}"
        super().__init__(full_message, error_code="service_misconfigured", http_status=500, details={"service": service_name})


class ExternalServiceUnavailableError(SmartHomeException):
    """外部服务不可用异常。"""

    def __init__(self, service_name: str, reason: str = "服务暂时不可用"):
        message = f"无法连接到 {service_name}：{reason}"
        super().__init__(message, error_code="external_service_unavailable", http_status=503, details={"service": service_name})


class OperationTimeoutError(SmartHomeException):
    """操作超时异常。"""

    def __init__(self, operation: str, timeout_seconds: int):
        message = f"操作超时 ({operation})，超时限制：{timeout_seconds}秒"
        super().__init__(message, error_code="operation_timeout", http_status=504, details={"operation": operation, "timeout": timeout_seconds})


class InvalidStateError(SmartHomeException):
    """对象状态不合法异常。"""

    def __init__(self, context: str, current_state: str, expected_state: str | list[str]):
        expected_str = expected_state if isinstance(expected_state, str) else " 或 ".join(expected_state)
        message = f"{context} 当前状态为 '{current_state}'，期望状态为 '{expected_str}'"
        super().__init__(message, error_code="invalid_state", http_status=400, details={"context": context, "current": current_state, "expected": expected_state})


class DependencyError(SmartHomeException):
    """依赖关系错误（如删除时存在关联记录）。"""

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message, error_code="dependency_error", http_status=409, details=details)


# 向后兼容别名
NotFoundError = ResourceNotFoundError
ConfigurationError = ServiceConfigurationError
ExternalServiceError = ExternalServiceUnavailableError
