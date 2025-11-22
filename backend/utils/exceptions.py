"""
Custom exceptions for Thinker application
"""
from fastapi import HTTPException, status

class ThinkerException(Exception):
    """Base exception for Thinker application"""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)

class DatasetNotFoundException(ThinkerException):
    """Raised when a dataset is not found"""
    def __init__(self, dataset_id: str):
        message = f"Dataset not found: {dataset_id}"
        super().__init__(message, status_code=404)

class DatasetValidationException(ThinkerException):
    """Raised when dataset validation fails"""
    def __init__(self, message: str):
        super().__init__(f"Dataset validation failed: {message}", status_code=400)

class TrainingJobNotFoundException(ThinkerException):
    """Raised when a training job is not found"""
    def __init__(self, job_id: str):
        message = f"Training job not found: {job_id}"
        super().__init__(message, status_code=404)

class TrainingFailedException(ThinkerException):
    """Raised when training fails"""
    def __init__(self, job_id: str, reason: str):
        message = f"Training job {job_id} failed: {reason}"
        super().__init__(message, status_code=500)

class ModelNotFoundException(ThinkerException):
    """Raised when a model is not found"""
    def __init__(self, model_name: str):
        message = f"Model not found: {model_name}"
        super().__init__(message, status_code=404)

class TinkerAPIException(ThinkerException):
    """Raised when Tinker SDK API call fails"""
    def __init__(self, operation: str, reason: str):
        message = f"Tinker SDK error during {operation}: {reason}"
        super().__init__(message, status_code=502)

class APIKeyMissingException(ThinkerException):
    """Raised when Tinker API key is missing"""
    def __init__(self):
        message = "Tinker API key not configured. Please set TINKER_API_KEY environment variable or provide X-API-Key header."
        super().__init__(message, status_code=401)

class HuggingFaceException(ThinkerException):
    """Raised when HuggingFace operation fails"""
    def __init__(self, operation: str, reason: str):
        message = f"HuggingFace error during {operation}: {reason}"
        super().__init__(message, status_code=502)

def convert_to_http_exception(exc: ThinkerException) -> HTTPException:
    """Convert a ThinkerException to a FastAPI HTTPException"""
    return HTTPException(status_code=exc.status_code, detail=exc.message)
