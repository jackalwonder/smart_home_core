"""全局错误处理中间件和异常处理器。"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Callable

from fastapi import Request, status
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware

from app.schemas.error import ErrorDetailSchema, ErrorResponseSchema
from app.services.exceptions import SmartHomeException


class RequestIDMiddleware(BaseHTTPMiddleware):
    """为每个请求添加唯一的追踪ID。"""

    async def dispatch(self, request: Request, call_next: Callable):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


def create_error_response(
    exception: Exception,
    request: Request,
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
) -> ErrorResponseSchema:
    """创建统一格式的错误响应。"""

    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    if isinstance(exception, SmartHomeException):
        # 业务异常处理
        details = None
        if exception.details:
            details = [ErrorDetailSchema(field=k, message=str(v)) for k, v in exception.details.items()]

        return ErrorResponseSchema(
            error=exception.error_code,
            message=exception.message,
            code=exception.business_code,
            timestamp=datetime.utcnow(),
            request_id=request_id,
            details=details,
            path=request.url.path,
        )

    # 通用异常处理
    error_code = {
        status.HTTP_400_BAD_REQUEST: "bad_request",
        status.HTTP_401_UNAUTHORIZED: "unauthorized",
        status.HTTP_403_FORBIDDEN: "forbidden",
        status.HTTP_404_NOT_FOUND: "not_found",
        status.HTTP_422_UNPROCESSABLE_ENTITY: "validation_error",
        status.HTTP_429_TOO_MANY_REQUESTS: "rate_limit_exceeded",
        status.HTTP_503_SERVICE_UNAVAILABLE: "service_unavailable",
    }.get(status_code, "internal_server_error")

    return ErrorResponseSchema(
        error=error_code,
        message=str(exception) or "发生错误，请稍后重试",
        code=1000 + status_code % 1000,
        timestamp=datetime.utcnow(),
        request_id=request_id,
        path=request.url.path,
    )


async def smart_home_exception_handler(request: Request, exception: SmartHomeException) -> JSONResponse:
    """处理业务异常。"""
    error_response = create_error_response(exception, request, exception.http_status)

    # 记录异常日志
    if exception.http_status >= 500:
        logger.error(
            "业务异常: {error} - {message}",
            error=exception.error_code,
            message=exception.message,
            request_id=error_response.request_id,
            extra={"exception": exception},
        )
    else:
        logger.warning(
            "业务异常: {error} - {message}",
            error=exception.error_code,
            message=exception.message,
            request_id=error_response.request_id,
        )

    return JSONResponse(
        status_code=exception.http_status,
        content=error_response.model_dump(mode="json"),
    )


async def general_exception_handler(request: Request, exception: Exception) -> JSONResponse:
    """处理通用异常（捕获未预期的错误）。"""

    # 记录完整的堆栈追踪
    logger.exception(
        "未预期的异常",
        exc_info=exception,
        request_id=getattr(request.state, "request_id", "unknown"),
    )

    error_response = create_error_response(exception, request, status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response.model_dump(mode="json"),
    )
