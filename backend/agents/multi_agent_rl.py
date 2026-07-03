"""
Multi-Agent RL Arena — real reinforcement learning, not random numbers.

The old arena spun up billable LoRA clients, returned hardcoded f-string
"responses", and scored them with random.uniform(). This version runs a genuine
importance-sampling RL update for every agent each round (via the shared
engine.rl_step), tracks a real reward leaderboard, and — in swarm mode —
evolves the population by having the weakest agents reload the leader's
checkpoint (real weight transfer through save_state / load_state).

Modes:
  - tournament: every agent trains on the shared tasks each round; ranked by reward.
  - swarm:      same, plus evolutionary selection — the bottom half reload the
                current leader's weights between rounds.
"""
from __future__ import annotations

import random
from typing import Any, Callable

from training import engine
from utils import logger

ReportFn = Callable[[int, dict[str, Any], str], None]
CancelFn = Callable[[], bool]


async def run_arena(config: dict[str, Any], tasks: list[str],
                    report: ReportFn, should_cancel: CancelFn) -> dict[str, Any]:
    if config.get("dry_run"):
        return _dry_arena(config, tasks, report, should_cancel)

    num_agents = max(2, int(config.get("num_agents", 3)))
    base_model = config.get("base_model", "Qwen/Qwen3.5-4B")
    rank = int(config.get("rank", 32))
    mode = config.get("mode", "tournament")
    num_rounds = int(config.get("num_rounds", 3))
    group_size = max(2, int(config.get("rl_group_size", 4)))
    max_tokens = int(config.get("rl_max_tokens", 256))
    lr = float(config.get("learning_rate", 1e-5))

    tinker, types, _ = engine.load_sdk()
    TD = engine._tensordata(types)
    reward_fn = engine.default_reward
    prompts = [{"prompt": t, "reference": ""} for t in tasks]

    service = tinker.ServiceClient()
    report(0, {"mode": "real"}, f"Spinning up {num_agents} agents on {base_model}…")

    agents = []
    for i in range(num_agents):
        tc = await service.create_lora_training_client_async(base_model=base_model, rank=rank)
        tok = tc.get_tokenizer()
        rend, _ = engine.build_renderer(base_model, tok)
        agents.append({"id": f"agent-{i + 1}", "tc": tc, "rend": rend, "tok": tok,
                       "adam": types.AdamParams(learning_rate=lr), "score": 0.0, "history": []})

    board: list[dict[str, Any]] = []
    for rnd in range(num_rounds):
        if should_cancel():
            break
        results = []
        for a in agents:
            if should_cancel():
                break
            m = await engine.rl_step(a["tc"], a["rend"], a["tok"], types, TD, prompts, reward_fn, a["adam"],
                                     group_size=group_size, max_tokens=max_tokens, temperature=1.0,
                                     step_name=f"{a['id']}-r{rnd}")
            a["score"] = float(m.get("reward_mean", 0.0))
            a["history"].append(a["score"])
            results.append({"agent": a["id"], "reward_mean": a["score"]})

        board = sorted([{"agent": a["id"], "score": a["score"], "history": a["history"]} for a in agents],
                       key=lambda x: x["score"], reverse=True)
        report(rnd + 1, {"round": rnd + 1, "leaderboard": board, "results": results,
                         "progress": (rnd + 1) / num_rounds * 100, "mode": "real"},
               f"Round {rnd + 1}/{num_rounds} — leader {board[0]['agent']} ({board[0]['score']:.3f})")

        if mode == "swarm" and rnd < num_rounds - 1 and not should_cancel():
            await _evolve(agents, types)

    best = board[0]["agent"] if board else None
    return {"mode": mode, "rounds": num_rounds, "leaderboard": board, "best_agent": best,
            "num_agents": num_agents, "base_model": base_model}


async def _evolve(agents: list[dict], types) -> None:
    """Swarm selection: the bottom half reload the current leader's weights."""
    ranked = sorted(agents, key=lambda a: a["score"], reverse=True)
    leader = ranked[0]
    try:
        state = await leader["tc"].save_state_async(name=f"leader-{leader['id']}")
        path = (await state.result_async()).path
    except Exception as e:
        logger.warning(f"Swarm evolve: could not save leader state ({e}); skipping transfer")
        return
    for a in ranked[len(ranked) // 2:]:
        if a is leader:
            continue
        try:
            await (await a["tc"].load_state_async(path)).result_async()
        except Exception as e:
            logger.warning(f"Swarm evolve: {a['id']} could not load leader weights ({e})")


def _dry_arena(config, tasks, report: ReportFn, should_cancel: CancelFn) -> dict[str, Any]:
    """Clearly-labeled synthetic arena for previewing the UI without a key."""
    num_agents = max(2, int(config.get("num_agents", 3)))
    num_rounds = int(config.get("num_rounds", 3))
    scores = {f"agent-{i + 1}": 0.2 + random.random() * 0.1 for i in range(num_agents)}
    hist = {k: [] for k in scores}
    for rnd in range(num_rounds):
        if should_cancel():
            break
        for k in scores:
            scores[k] = min(1.0, scores[k] + random.random() * 0.15)
            hist[k].append(round(scores[k], 3))
        board = sorted([{"agent": k, "score": round(v, 3), "history": hist[k]} for k, v in scores.items()],
                       key=lambda x: x["score"], reverse=True)
        report(rnd + 1, {"round": rnd + 1, "leaderboard": board,
                         "progress": (rnd + 1) / num_rounds * 100, "mode": "demo"},
               f"[DEMO] Round {rnd + 1}/{num_rounds}")
    board = sorted([{"agent": k, "score": round(v, 3), "history": hist[k]} for k, v in scores.items()],
                   key=lambda x: x["score"], reverse=True)
    return {"mode": config.get("mode", "tournament"), "rounds": num_rounds, "leaderboard": board,
            "best_agent": board[0]["agent"] if board else None, "demo": True}
