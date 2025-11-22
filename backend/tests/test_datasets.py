"""
Tests for dataset management endpoints
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, mock_open
import os
import tempfile
import shutil

# Import the FastAPI app
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import app
from routes.datasets import datasets, DATA_DIR

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_datasets():
    """Reset datasets list before each test"""
    datasets.clear()
    yield
    datasets.clear()


@pytest.fixture
def temp_data_dir():
    """Create a temporary data directory for tests"""
    temp_dir = tempfile.mkdtemp()
    original_dir = DATA_DIR
    # Monkeypatch the DATA_DIR
    import routes.datasets as datasets_module
    datasets_module.DATA_DIR = temp_dir
    yield temp_dir
    # Cleanup
    datasets_module.DATA_DIR = original_dir
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)


class TestListDatasets:
    """Test dataset listing endpoint"""

    def test_list_empty_datasets(self):
        """Test listing datasets when none exist"""
        response = client.get("/api/datasets/")
        assert response.status_code == 200
        assert response.json() == {"datasets": []}

    def test_list_datasets_with_data(self):
        """Test listing datasets when datasets exist"""
        # Add mock dataset
        datasets.append({
            "id": "test-123",
            "name": "Test Dataset",
            "type": "code_review",
            "format": "jsonl",
            "size": "1.5 MB",
            "numSamples": 100
        })

        response = client.get("/api/datasets/")
        assert response.status_code == 200
        data = response.json()
        assert len(data["datasets"]) == 1
        assert data["datasets"][0]["name"] == "Test Dataset"


class TestUploadDataset:
    """Test dataset upload endpoint"""

    def test_upload_dataset_success(self, temp_data_dir):
        """Test successful dataset upload"""
        # Create a mock JSONL file
        file_content = b'{"input": "test", "output": "result"}\n{"input": "test2", "output": "result2"}'

        response = client.post(
            "/api/datasets/upload",
            files={"file": ("test.jsonl", file_content, "application/json")},
            data={
                "name": "Test Dataset",
                "type": "code_review",
                "format": "jsonl",
                "train_split": 80,
                "val_split": 15,
                "test_split": 5
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Dataset uploaded successfully"
        assert "dataset" in data
        assert data["dataset"]["name"] == "Test Dataset"
        assert data["dataset"]["format"] == "jsonl"
        assert data["dataset"]["numSamples"] == 2

    def test_upload_dataset_invalid_splits(self):
        """Test upload with invalid split percentages"""
        file_content = b'{"input": "test", "output": "result"}'

        response = client.post(
            "/api/datasets/upload",
            files={"file": ("test.jsonl", file_content, "application/json")},
            data={
                "name": "Test Dataset",
                "type": "code_review",
                "format": "jsonl",
                "train_split": 70,  # Sum is 95, not 100
                "val_split": 15,
                "test_split": 10
            }
        )

        assert response.status_code == 400
        data = response.json()
        assert "Splits must sum to 100%" in data["message"]

    def test_upload_dataset_invalid_format(self):
        """Test upload with invalid format"""
        file_content = b'test content'

        response = client.post(
            "/api/datasets/upload",
            files={"file": ("test.txt", file_content, "text/plain")},
            data={
                "name": "Test Dataset",
                "type": "code_review",
                "format": "txt",  # Invalid format
                "train_split": 80,
                "val_split": 15,
                "test_split": 5
            }
        )

        assert response.status_code == 400
        data = response.json()
        assert "Invalid format" in data["message"]

    def test_upload_dataset_missing_file(self):
        """Test upload without file"""
        response = client.post(
            "/api/datasets/upload",
            data={
                "name": "Test Dataset",
                "type": "code_review",
                "format": "jsonl"
            }
        )

        assert response.status_code == 422  # Validation error


class TestDatasetValidation:
    """Test dataset validation logic"""

    def test_split_percentages_must_sum_to_100(self):
        """Verify splits validation"""
        file_content = b'{"test": "data"}'

        # Test with splits summing to 99
        response = client.post(
            "/api/datasets/upload",
            files={"file": ("test.jsonl", file_content, "application/json")},
            data={
                "name": "Test",
                "type": "test",
                "format": "jsonl",
                "train_split": 79,
                "val_split": 15,
                "test_split": 5
            }
        )
        assert response.status_code == 400

        # Test with splits summing to 101
        response = client.post(
            "/api/datasets/upload",
            files={"file": ("test.jsonl", file_content, "application/json")},
            data={
                "name": "Test",
                "type": "test",
                "format": "jsonl",
                "train_split": 81,
                "val_split": 15,
                "test_split": 5
            }
        )
        assert response.status_code == 400


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
