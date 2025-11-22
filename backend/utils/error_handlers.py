"""
Error handling middleware and utilities for Thinker API
"""
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import traceback
from typing import Union
from .logger import logger
from .exceptions import ThinkerException

async def thinker_exception_handler(request: Request, exc: ThinkerException) -> JSONResponse:
    """Handle custom ThinkerException instances"""
    logger.error(
        f"ThinkerException: {exc.message}",
        extra={
            "path": request.url.path,
            "method": request.method,
            "status_code": exc.status_code
        }
    )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "message": exc.message,
            "path": request.url.path,
            "status_code": exc.status_code
        }
    )

async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handle HTTP exceptions"""
    logger.warning(
        f"HTTP {exc.status_code}: {exc.detail}",
        extra={
            "path": request.url.path,
            "method": request.method,
            "status_code": exc.status_code
        }
    )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "HTTPException",
            "message": exc.detail,
            "path": request.url.path,
            "status_code": exc.status_code
        }
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle request validation errors"""
    logger.warning(
        f"Validation error: {exc.errors()}",
        extra={
            "path": request.url.path,
            "method": request.method
        }
    )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "ValidationError",
            "message": "Request validation failed",
            "details": exc.errors(),
            "path": request.url.path,
            "status_code": 422
        }
    )

async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle all uncaught exceptions"""
    # Log full traceback for debugging
    logger.error(
        f"Unhandled exception: {str(exc)}",
        exc_info=True,
        extra={
            "path": request.url.path,
            "method": request.method,
            "traceback": traceback.format_exc()
        }
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred. Please check logs for details.",
            "path": request.url.path,
            "status_code": 500
        }
    )

def safe_execute(operation_name: str):
    """
    Decorator to safely execute operations with error handling and logging

    Usage:
        @safe_execute("load_dataset")
        async def load_dataset(dataset_id: str):
            # ... operation code ...
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            try:
                logger.debug(f"Starting operation: {operation_name}")
                result = await func(*args, **kwargs)
                logger.debug(f"Completed operation: {operation_name}")
                return result
            except ThinkerException:
                # Re-raise custom exceptions (they'll be handled by middleware)
                raise
            except Exception as e:
                logger.error(
                    f"Operation '{operation_name}' failed: {str(e)}",
                    exc_info=True
                )
                raise ThinkerException(
                    message=f"Operation '{operation_name}' failed: {str(e)}",
                    status_code=500
                )
        return wrapper
    return decorator
