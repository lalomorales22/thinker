"""
Tests for training job endpoints
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, AsyncMock
import os
import asyncio

# Import the FastAPI app
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import app
from routes.training import training_jobs, TrainingConfig

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_training_jobs():
    """Reset training jobs before each test"""
    training_jobs.clear()
    yield
    training_jobs.clear()


class TestStartTraining:
    """Test training job creation endpoint"""

    def test_start_training_job(self):
        """Test starting a new training job"""
        config = {
            "model_name": "meta-llama/Llama-3.2-1B",
            "rank": 32,
            "learning_rate": 0.0001,
            "num_steps": 100,
            "batch_size": 4,
            "training_type": "code_review"
        }

        response = client.post("/api/training/start", json=config)

        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "queued"
        assert data["message"] == "Training job created successfully"

        # Verify job was added to training_jobs
        job_id = data["job_id"]
        assert job_id in training_jobs

    def test_start_training_with_custom_params(self):
        """Test starting training with custom parameters"""
        config = {
            "model_name": "meta-llama/Llama-3.2-1B",
            "rank": 64,
            "learning_rate": 0.0005,
            "num_steps": 500,
            "batch_size": 8,
            "training_type": "DPO",
            "dataset_id": "test-dataset-123",
            "checkpoint_interval": 100
        }

        response = client.post("/api/training/start", json=config)

        assert response.status_code == 200
        data = response.json()
        job_id = data["job_id"]

        # Verify job config
        job = training_jobs[job_id]
        assert job["config"]["rank"] == 64
        assert job["config"]["training_type"] == "DPO"
        assert job["config"]["checkpoint_interval"] == 100

    def test_start_training_invalid_config(self):
        """Test starting training with invalid configuration"""
        config = {
            "model_name": "meta-llama/Llama-3.2-1B",
            "rank": "invalid",  # Should be int
            "learning_rate": 0.0001,
            "num_steps": 100
        }

        response = client.post("/api/training/start", json=config)
        assert response.status_code == 422  # Validation error


class TestListJobs:
    """Test job listing endpoint"""

    def test_list_empty_jobs(self):
        """Test listing jobs when none exist"""
        response = client.get("/api/training/jobs")

        assert response.status_code == 200
        data = response.json()
        assert data["jobs"] == []

    def test_list_jobs_with_data(self):
        """Test listing jobs when jobs exist"""
        # Add mock jobs
        training_jobs["job_1"] = {
            "job_id": "job_1",
            "status": "running",
            "config": {"model_name": "test"},
            "current_step": 50,
            "metrics": {"loss": 1.5}
        }
        training_jobs["job_2"] = {
            "job_id": "job_2",
            "status": "completed",
            "config": {"model_name": "test2"},
            "current_step": 100,
            "metrics": {"loss": 0.5}
        }

        response = client.get("/api/training/jobs")

        assert response.status_code == 200
        data = response.json()
        assert len(data["jobs"]) == 2


class TestGetJob:
    """Test individual job retrieval"""

    def test_get_existing_job(self):
        """Test getting an existing job"""
        job_id = "test_job_123"
        training_jobs[job_id] = {
            "job_id": job_id,
            "status": "running",
            "config": {"model_name": "test"},
            "current_step": 25,
            "metrics": {"loss": 2.0}
        }

        response = client.get(f"/api/training/jobs/{job_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == job_id
        assert data["status"] == "running"
        assert data["current_step"] == 25

    def test_get_nonexistent_job(self):
        """Test getting a job that doesn't exist"""
        response = client.get("/api/training/jobs/nonexistent_job")

        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["message"].lower()


class TestCancelJob:
    """Test job cancellation"""

    def test_cancel_running_job(self):
        """Test cancelling a running job"""
        job_id = "test_job_456"
        training_jobs[job_id] = {
            "job_id": job_id,
            "status": "running",
            "config": {},
            "current_step": 10,
            "metrics": {}
        }

        response = client.delete(f"/api/training/jobs/{job_id}")

        assert response.status_code == 200
        assert training_jobs[job_id]["status"] == "cancelled"

    def test_cancel_completed_job(self):
        """Test attempting to cancel a completed job"""
        job_id = "test_job_789"
        training_jobs[job_id] = {
            "job_id": job_id,
            "status": "completed",
            "config": {},
            "current_step": 100,
            "metrics": {}
        }

        response = client.delete(f"/api/training/jobs/{job_id}")

        assert response.status_code == 200
        data = response.json()
        assert "cannot cancel" in data["message"]

    def test_cancel_nonexistent_job(self):
        """Test cancelling a job that doesn't exist"""
        response = client.delete("/api/training/jobs/nonexistent")

        assert response.status_code == 404


class TestGetMetrics:
    """Test metrics retrieval"""

    def test_get_metrics_for_job(self):
        """Test getting metrics for an existing job"""
        job_id = "metrics_test_job"
        training_jobs[job_id] = {
            "job_id": job_id,
            "status": "running",
            "config": {},
            "current_step": 75,
            "metrics": {
                "loss": 1.2,
                "step": 75,
                "progress": 75.0
            }
        }

        response = client.get(f"/api/training/metrics/{job_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == job_id
        assert data["current_step"] == 75
        assert data["metrics"]["loss"] == 1.2

    def test_get_metrics_nonexistent_job(self):
        """Test getting metrics for non-existent job"""
        response = client.get("/api/training/metrics/nonexistent")

        assert response.status_code == 404


class TestMultiAgentTraining:
    """Test multi-agent training endpoints"""

    def test_start_multi_agent_job(self):
        """Test starting a multi-agent training job"""
        config = {
            "num_agents": 4,
            "base_model": "meta-llama/Llama-3.2-1B",
            "rank": 32,
            "mode": "tournament",
            "num_rounds": 3,
            "tasks": [
                "Review this code",
                "Optimize this function"
            ]
        }

        response = client.post("/api/training/multi-agent/start", json=config)

        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "queued"
        assert "multiagent_" in data["job_id"]

    def test_multi_agent_with_different_modes(self):
        """Test multi-agent with different modes"""
        modes = ["tournament", "collaborative", "swarm"]

        for mode in modes:
            config = {
                "num_agents": 3,
                "base_model": "meta-llama/Llama-3.2-1B",
                "rank": 16,
                "mode": mode,
                "num_rounds": 2
            }

            response = client.post("/api/training/multi-agent/start", json=config)
            assert response.status_code == 200
            data = response.json()
            job_id = data["job_id"]
            assert training_jobs[job_id]["config"]["mode"] == mode


class TestTrainingConfig:
    """Test training configuration validation"""

    def test_training_config_defaults(self):
        """Test that training config uses proper defaults"""
        config = TrainingConfig(
            model_name="test-model"
        )

        assert config.rank == 32
        assert config.learning_rate == 1e-4
        assert config.num_steps == 100
        assert config.batch_size == 4
        assert config.checkpoint_interval == 500

    def test_training_config_custom_values(self):
        """Test training config with custom values"""
        config = TrainingConfig(
            model_name="test-model",
            rank=64,
            learning_rate=5e-5,
            num_steps=1000,
            batch_size=8,
            checkpoint_interval=250
        )

        assert config.rank == 64
        assert config.learning_rate == 5e-5
        assert config.num_steps == 1000
        assert config.batch_size == 8
        assert config.checkpoint_interval == 250


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
