"""
Multi-Agent RL Training - Agents compete and collaborate to learn
"""
import asyncio
from typing import List, Dict, Any, Tuple
from datetime import datetime
import random

class Agent:
    """
    Represents a single agent in the multi-agent system.
    """
    def __init__(self, agent_id: str, base_model: str, rank: int):
        self.agent_id = agent_id
        self.base_model = base_model
        self.rank = rank
        self.training_client = None
        self.sampler_client = None
        self.score = 0.0
        self.generation = 0
        self.parent_ids = []  # Track lineage

    async def initialize(self, service_client):
        """Initialize the agent's training client"""
        self.training_client = await service_client.create_lora_training_client_async(
            base_model=self.base_model,
            rank=self.rank
        )
        self.sampler_client = await self.training_client.save_weights_and_get_sampling_client_async(
            f"agent_{self.agent_id}_gen_{self.generation}"
        )

    async def generate_response(self, prompt: str) -> str:
        """Generate a response to a prompt"""
        if not self.sampler_client:
            return ""

        try:
            # In production, use sampler_client to generate
            # For now, return mock response
            return f"Response from Agent {self.agent_id}: {prompt[:50]}..."
        except:
            return ""

    async def save_checkpoint(self) -> str:
        """Save agent's current state"""
        if not self.training_client:
            return ""

        checkpoint_name = f"agent_{self.agent_id}_gen_{self.generation}_score_{self.score:.2f}"
        try:
            checkpoint_path = await self.training_client.save_weights_async(name=checkpoint_name)
            return checkpoint_path
        except Exception as e:
            print(f"Warning: Failed to save agent checkpoint: {e}")
            return ""

class MultiAgentArena:
    """
    Arena where multiple agents compete and collaborate.

    Modes:
    - tournament: Agents compete head-to-head
    - collaborative: Agents work together on tasks
    - swarm: Evolutionary approach with breeding
    """

    def __init__(
        self,
        num_agents: int = 4,
        base_model: str = "meta-llama/Llama-3.2-1B",
        rank: int = 32,
        mode: str = "tournament"
    ):
        self.num_agents = num_agents
        self.base_model = base_model
        self.rank = rank
        self.mode = mode
        self.agents: List[Agent] = []
        self.generation = 0
        self.arena_history: List[Dict] = []

    async def initialize_agents(self, service_client):
        """Create and initialize all agents"""
        print(f"Initializing {self.num_agents} agents...")

        for i in range(self.num_agents):
            agent = Agent(
                agent_id=f"agent_{i}",
                base_model=self.base_model,
                rank=self.rank
            )
            await agent.initialize(service_client)
            self.agents.append(agent)
            print(f"Agent {i} initialized")

        print(f"All {self.num_agents} agents ready!")

    async def run_tournament(self, tasks: List[str], num_rounds: int = 3) -> List[Dict]:
        """
        Run tournament where agents compete on tasks.

        Returns:
            Leaderboard with agent scores
        """
        print(f"\n=== Tournament Mode: {num_rounds} rounds ===\n")
        results = []

        for round_num in range(num_rounds):
            print(f"Round {round_num + 1}/{num_rounds}")
            round_results = []

            # Each agent performs all tasks
            for agent in self.agents:
                agent_task_scores = []

                for task in tasks:
                    # Agent generates response
                    response = await agent.generate_response(task)

                    # Evaluate response (in production, use reward model or human eval)
                    score = await self.evaluate_response(task, response)
                    agent_task_scores.append(score)

                # Average score for this round
                round_score = sum(agent_task_scores) / len(agent_task_scores)
                agent.score += round_score

                round_results.append({
                    "agent_id": agent.agent_id,
                    "round": round_num + 1,
                    "score": round_score,
                    "total_score": agent.score
                })

                print(f"  {agent.agent_id}: Round score = {round_score:.3f}, Total = {agent.score:.3f}")

            results.extend(round_results)

            # Update arena history
            self.arena_history.append({
                "generation": self.generation,
                "round": round_num + 1,
                "results": round_results
            })

        # Final leaderboard
        leaderboard = sorted(
            [{"agent_id": a.agent_id, "score": a.score} for a in self.agents],
            key=lambda x: x["score"],
            reverse=True
        )

        print(f"\n=== Final Leaderboard ===")
        for i, entry in enumerate(leaderboard):
            print(f"{i+1}. {entry['agent_id']}: {entry['score']:.3f}")

        return leaderboard

    async def run_collaborative(self, tasks: List[str]) -> List[Dict]:
        """
        Run collaborative mode where agents work together.

        Each task is solved by multiple agents:
        - Agent A generates initial response
        - Agent B critiques and improves
        - Agent C synthesizes best parts
        """
        print(f"\n=== Collaborative Mode ===\n")
        results = []

        for task_idx, task in enumerate(tasks):
            print(f"\nTask {task_idx + 1}: {task[:50]}...")

            # Round-robin assignment
            primary = self.agents[task_idx % len(self.agents)]
            critic = self.agents[(task_idx + 1) % len(self.agents)]
            synthesizer = self.agents[(task_idx + 2) % len(self.agents)]

            # Step 1: Primary agent generates response
            response_1 = await primary.generate_response(task)
            print(f"  Primary ({primary.agent_id}): Generated initial response")

            # Step 2: Critic evaluates and suggests improvements
            critique_prompt = f"Critique this response: {response_1}"
            critique = await critic.generate_response(critique_prompt)
            print(f"  Critic ({critic.agent_id}): Provided critique")

            # Step 3: Synthesizer combines insights
            synthesis_prompt = f"Improve based on critique. Original: {response_1}. Critique: {critique}"
            final_response = await synthesizer.generate_response(synthesis_prompt)
            print(f"  Synthesizer ({synthesizer.agent_id}): Created final response")

            # Evaluate final response
            score = await self.evaluate_response(task, final_response)

            # Distribute rewards to collaborators
            primary.score += score * 0.4
            critic.score += score * 0.3
            synthesizer.score += score * 0.3

            results.append({
                "task": task,
                "primary": primary.agent_id,
                "critic": critic.agent_id,
                "synthesizer": synthesizer.agent_id,
                "score": score
            })

            print(f"  Final score: {score:.3f}")

        return results

    async def run_swarm_evolution(
        self,
        tasks: List[str],
        generations: int = 5,
        survival_rate: float = 0.5
    ) -> List[Dict]:
        """
        Run evolutionary swarm training.

        Each generation:
        1. All agents compete on tasks
        2. Top 50% survive
        3. Winners "breed" to create next generation
        4. Repeat
        """
        print(f"\n=== Swarm Evolution: {generations} generations ===\n")
        evolution_history = []

        for gen in range(generations):
            self.generation = gen
            print(f"\nGeneration {gen + 1}/{generations}")

            # Evaluate all agents
            for agent in self.agents:
                agent.score = 0.0  # Reset score for this generation

                for task in tasks:
                    response = await agent.generate_response(task)
                    score = await self.evaluate_response(task, response)
                    agent.score += score

                print(f"  {agent.agent_id}: Score = {agent.score:.3f}")

            # Sort by score
            self.agents.sort(key=lambda a: a.score, reverse=True)

            # Selection: Top agents survive
            num_survivors = max(2, int(len(self.agents) * survival_rate))
            survivors = self.agents[:num_survivors]

            print(f"\n  Survivors: {[a.agent_id for a in survivors]}")

            # Record generation stats
            evolution_history.append({
                "generation": gen + 1,
                "best_score": survivors[0].score,
                "avg_score": sum(a.score for a in self.agents) / len(self.agents),
                "survivors": [a.agent_id for a in survivors]
            })

            # Breeding: Create next generation
            if gen < generations - 1:  # Don't breed on last generation
                new_agents = []

                # Keep best agent
                new_agents.append(survivors[0])

                # Breed rest
                while len(new_agents) < self.num_agents:
                    # Select two random parents
                    parent1 = random.choice(survivors)
                    parent2 = random.choice(survivors)

                    # Create offspring (in production, interpolate LoRA weights)
                    offspring = Agent(
                        agent_id=f"agent_{len(new_agents)}_gen_{gen+1}",
                        base_model=self.base_model,
                        rank=self.rank
                    )
                    offspring.generation = gen + 1
                    offspring.parent_ids = [parent1.agent_id, parent2.agent_id]

                    # Initialize offspring (in production, interpolate parent weights)
                    # For now, reinitialize from base
                    # await offspring.initialize(service_client)

                    new_agents.append(offspring)

                self.agents = new_agents
                print(f"  New generation created from {len(survivors)} survivors")

        print(f"\n=== Evolution Complete ===")
        print(f"Final best score: {evolution_history[-1]['best_score']:.3f}")
        print(f"Improvement: {evolution_history[-1]['best_score'] - evolution_history[0]['best_score']:.3f}")

        return evolution_history

    async def evaluate_response(self, task: str, response: str) -> float:
        """
        Evaluate response quality.

        In production, this would use:
        - Reward model
        - Human evaluation
        - Test execution (for code)
        - Metric comparison

        For now, use mock scoring.
        """
        # Mock evaluation - random score with slight improvement over time
        base_score = random.uniform(0.5, 1.0)
        bonus = self.generation * 0.05  # Slight improvement per generation
        return min(1.0, base_score + bonus)

    def get_arena_stats(self) -> Dict[str, Any]:
        """Get current arena statistics"""
        return {
            "num_agents": len(self.agents),
            "generation": self.generation,
            "mode": self.mode,
            "leaderboard": sorted(
                [{"agent_id": a.agent_id, "score": a.score} for a in self.agents],
                key=lambda x: x["score"],
                reverse=True
            ),
            "history": self.arena_history
        }

# Helper functions for route integration

async def create_multi_agent_training_job(
    job_id: str,
    num_agents: int,
    base_model: str,
    rank: int,
    mode: str,
    tasks: List[str],
    num_rounds: int
) -> Dict[str, Any]:
    """
    Create and run a multi-agent training job.

    Returns job results and statistics.
    """
    try:
        import tinker
        service_client = tinker.ServiceClient()

        # Create arena
        arena = MultiAgentArena(
            num_agents=num_agents,
            base_model=base_model,
            rank=rank,
            mode=mode
        )

        # Initialize agents
        await arena.initialize_agents(service_client)

        # Run appropriate mode
        if mode == "tournament":
            results = await arena.run_tournament(tasks, num_rounds)
        elif mode == "collaborative":
            results = await arena.run_collaborative(tasks)
        elif mode == "swarm":
            results = await arena.run_swarm_evolution(tasks, generations=num_rounds)
        else:
            raise ValueError(f"Unknown mode: {mode}")

        # Get final stats
        stats = arena.get_arena_stats()

        return {
            "job_id": job_id,
            "status": "completed",
            "mode": mode,
            "results": results,
            "stats": stats,
            "best_agent": stats["leaderboard"][0]["agent_id"] if stats["leaderboard"] else None
        }

    except Exception as e:
        print(f"Multi-agent training error: {e}")
        return {
            "job_id": job_id,
            "status": "failed",
            "error": str(e)
        }
