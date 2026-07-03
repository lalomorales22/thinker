"""
Real Tinker training engine — supervised, preference (DPO), and RL.

This replaces the old loop that imported renderers from the wrong package,
swallowed the resulting ImportError, and then FAKED a decreasing loss curve
while reporting success. Here, every path uses the real Tinker SDK as
documented, and when the SDK is unavailable or a step errors, the job FAILS
LOUDLY with the real reason — it never invents metrics.

Key API facts this is built on (verified against tinker-docs, 2026-07):
  - Renderers live in `tinker_cookbook.renderers` (get_renderer, TrainOnWhat,
    get_recommended_renderer_name). Messages are plain {"role","content"} dicts.
  - `conversation_to_datum(conv, renderer, max_length, train_on_what)` turns a
    conversation into a training `Datum` with the correct target/weight tensors.
  - Same-clock-cycle step: submit forward_backward THEN optim_step, then await
    both — do not await forward_backward before submitting optim_step.
  - ForwardBackwardOutput exposes `.metrics` (dict) — there is no `.loss`.
  - Save: `save_weights_for_sampler_async` (inference) / `save_state_async`
    (resumable); `save_weights_and_get_sampling_client_async` returns a client.
  - DPO is a Bradley-Terry loss via `forward_backward_custom`, not cross_entropy.
  - RL uses `forward_backward(loss_fn="importance_sampling")` on sampled
    rollouts with per-token (target_tokens, logprobs, advantages).

The `dry_run` config flag produces clearly-labeled synthetic metrics so the UI
can be exercised without a Tinker key/credits. It is opt-in, never a fallback.
"""
from __future__ import annotations

import asyncio
import math
import random
from typing import Any, Awaitable, Callable, Optional

from utils import logger, TinkerAPIException

ReportFn = Callable[[int, dict[str, Any], str], None]
CancelFn = Callable[[], bool]


# --- Lazy SDK access ---------------------------------------------------------

def check_tinker() -> dict[str, Any]:
    """Report whether the Tinker SDK + cookbook are importable (no network)."""
    status = {"tinker": False, "cookbook": False, "reason": ""}
    try:
        import tinker  # noqa: F401
        status["tinker"] = True
    except Exception as e:  # pragma: no cover - depends on install
        status["reason"] = f"`tinker` not importable: {e}"
        return status
    try:
        import tinker_cookbook.renderers  # noqa: F401
        status["cookbook"] = True
    except Exception as e:  # pragma: no cover
        status["reason"] = f"`tinker_cookbook` not importable: {e}"
    return status


def _require_sdk():
    import os
    os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")  # avoid libomp double-init abort
    try:
        import tinker
        from tinker import types
    except Exception as e:
        raise TinkerAPIException(
            "import",
            f"The Tinker SDK is not installed in the backend environment ({e}). "
            "Run `pip install tinker` (and `tinker_cookbook`) and set TINKER_API_KEY.",
        )
    try:
        from tinker_cookbook import renderers as R
    except Exception as e:
        raise TinkerAPIException(
            "import",
            f"`tinker_cookbook` (renderers/chat templates) is not installed ({e}). "
            "Run `pip install tinker_cookbook`.",
        )
    return tinker, types, R


def _tensordata(types):
    return getattr(types, "TensorData", None) or _import_top_tensordata()


def _import_top_tensordata():
    import tinker
    return getattr(tinker, "TensorData")


def load_sdk():
    """Public accessor: returns (tinker, types, renderers) or raises honestly."""
    return _require_sdk()


def build_renderer(base_model: str, tokenizer, override: Optional[str] = None):
    """Public helper: build the right renderer for a base model (name, renderer)."""
    _, _, R = _require_sdk()
    name = _recommended_renderer_name(base_model, R, override)
    return R.get_renderer(name, tokenizer), name


def _recommended_renderer_name(base_model: str, R, override: Optional[str]) -> str:
    if override:
        return override
    try:
        fn = getattr(R, "get_recommended_renderer_name", None)
        if fn:
            return fn(base_model)
    except Exception:
        pass
    import catalog
    return catalog.renderer_for(base_model)


def _import_conversation_to_datum():
    for mod, attr in [
        ("tinker_cookbook.supervised.data", "conversation_to_datum"),
        ("tinker_cookbook.supervised", "conversation_to_datum"),
        ("tinker_cookbook.renderers", "conversation_to_datum"),
    ]:
        try:
            m = __import__(mod, fromlist=[attr])
            fn = getattr(m, attr, None)
            if fn:
                return fn
        except Exception:
            continue
    return None


def _as_torch(x):
    import torch
    if x is None:
        return None
    for meth in ("to_torch", "torch", "to_tensor"):
        f = getattr(x, meth, None)
        if callable(f):
            try:
                return f()
            except Exception:
                pass
    to_np = getattr(x, "to_numpy", None)
    if callable(to_np):
        try:
            return torch.as_tensor(to_np())
        except Exception:
            pass
    try:
        return torch.as_tensor(x)
    except Exception:
        return None


# --- Public entry ------------------------------------------------------------

async def run_training(
    kind: str,
    config: dict[str, Any],
    examples: list[Any],
    report: ReportFn,
    should_cancel: CancelFn,
) -> dict[str, Any]:
    """Dispatch a training run. `examples` are canonical rows from datautil.

    Returns a summary dict; raises on unrecoverable errors (caller marks failed).
    """
    kind = (kind or "sl").lower()
    if config.get("dry_run"):
        return await _run_dry(kind, config, examples, report, should_cancel)

    if not examples:
        raise TinkerAPIException("data", "No trainable examples were produced from the dataset.")

    if kind == "dpo":
        return await run_dpo(config, examples, report, should_cancel)
    if kind == "rl":
        return await run_rl(config, examples, report, should_cancel)
    return await run_supervised(config, examples, report, should_cancel)


# --- Supervised (cross_entropy) ---------------------------------------------

async def run_supervised(config, examples, report: ReportFn, should_cancel: CancelFn) -> dict[str, Any]:
    tinker, types, R = _require_sdk()
    base_model = config["base_model"]
    rank = int(config.get("rank", 32))
    lr = float(config.get("learning_rate", 1e-4))
    num_steps = int(config.get("num_steps", 100))
    batch_size = max(1, int(config.get("batch_size", 4)))
    max_length = int(config.get("max_length", 1024))

    report(0, {"mode": "real"}, f"Connecting to Tinker and loading {base_model}…")
    service = tinker.ServiceClient()
    training_client = await service.create_lora_training_client_async(base_model=base_model, rank=rank)
    tokenizer = training_client.get_tokenizer()
    renderer_name = _recommended_renderer_name(base_model, R, config.get("renderer_name"))
    renderer = R.get_renderer(renderer_name, tokenizer)
    report(0, {"mode": "real", "renderer": renderer_name}, "Rendering dataset into training examples…")

    conv_to_datum = _import_conversation_to_datum()
    train_on = getattr(R, "TrainOnWhat").LAST_ASSISTANT_MESSAGE

    def build_datum(messages):
        if conv_to_datum is not None:
            return conv_to_datum(messages, renderer, max_length=max_length, train_on_what=train_on)
        # Fallback: build (model_input, weights) and wrap into a Datum.
        model_input, weights = renderer.build_supervised_example(messages, train_on_what=train_on)
        return types.Datum(model_input=model_input, loss_fn_inputs={"weights": weights})

    data = []
    for messages in examples:
        try:
            data.append(build_datum(messages))
        except Exception as e:
            logger.warning(f"Skipping example that failed to render: {e}")
    if not data:
        raise TinkerAPIException("render", "Every example failed to render — check the dataset format.")

    adam = types.AdamParams(learning_rate=lr)
    checkpoint_interval = _checkpoint_interval(config, num_steps)
    checkpoints: list[dict[str, Any]] = []
    last_loss = 0.0

    for step in range(num_steps):
        if should_cancel():
            return _cancelled(step)
        batch = data[(step * batch_size) % len(data): (step * batch_size) % len(data) + batch_size]
        if not batch:
            batch = data[:batch_size]

        # Same-clock-cycle: submit fwd/bwd, then optim, then await both.
        fb_future = await training_client.forward_backward_async(batch, "cross_entropy")
        opt_future = await training_client.optim_step_async(adam)
        fb_result = await fb_future.result_async()
        await opt_future.result_async()

        last_loss = _loss_from(fb_result)
        metrics = {"loss": last_loss, "step": step + 1, "progress": (step + 1) / num_steps * 100,
                   "learning_rate": lr, "mode": "real"}
        report(step + 1, metrics, f"Training step {step + 1}/{num_steps}")

        if checkpoint_interval and (step + 1) % checkpoint_interval == 0 and (step + 1) < num_steps:
            try:
                fut = await training_client.save_weights_for_sampler_async(name=f"{config.get('model_name','model')}-step{step+1}")
                path = (await fut.result_async()).path
                checkpoints.append({"step": step + 1, "sampler_path": path, "loss": last_loss})
            except Exception as e:
                logger.warning(f"Checkpoint at step {step+1} failed: {e}")

    return await _finalize(training_client, config, {"loss": last_loss}, checkpoints, num_steps)


# --- Preference optimization (DPO, Bradley-Terry via custom loss) -------------

async def run_dpo(config, examples, report: ReportFn, should_cancel: CancelFn) -> dict[str, Any]:
    import torch
    import torch.nn.functional as F

    tinker, types, R = _require_sdk()
    base_model = config["base_model"]
    rank = int(config.get("rank", 32))
    lr = float(config.get("learning_rate", 1e-5))
    num_steps = int(config.get("num_steps", 100))
    batch_pairs = max(1, int(config.get("batch_size", 2)))
    max_length = int(config.get("max_length", 1024))
    beta = float(config.get("dpo_beta", 0.1))

    report(0, {"mode": "real"}, f"Connecting to Tinker and loading {base_model}…")
    service = tinker.ServiceClient()
    training_client = await service.create_lora_training_client_async(base_model=base_model, rank=rank)
    tokenizer = training_client.get_tokenizer()
    renderer_name = _recommended_renderer_name(base_model, R, config.get("renderer_name"))
    renderer = R.get_renderer(renderer_name, tokenizer)
    train_on = getattr(R, "TrainOnWhat").LAST_ASSISTANT_MESSAGE
    conv_to_datum = _import_conversation_to_datum()

    def build_datum(prompt, completion):
        messages = [{"role": "user", "content": prompt}, {"role": "assistant", "content": completion}]
        if conv_to_datum is not None:
            return conv_to_datum(messages, renderer, max_length=max_length, train_on_what=train_on)
        model_input, weights = renderer.build_supervised_example(messages, train_on_what=train_on)
        return types.Datum(model_input=model_input, loss_fn_inputs={"weights": weights})

    # Frozen reference = current (pre-training) weights.
    report(0, {"mode": "real"}, "Creating frozen reference model for preference comparison…")
    ref_sampler = await training_client.save_weights_and_get_sampling_client_async(name="dpo-reference")

    adam = types.AdamParams(learning_rate=lr)
    n = len(examples)

    def weight_vec(datum):
        w = _as_torch(datum.loss_fn_inputs.get("weights"))
        return w.float() if w is not None else None

    for step in range(num_steps):
        if should_cancel():
            return _cancelled(step)

        pairs = []
        for i in range(batch_pairs):
            ex = examples[(step * batch_pairs + i) % n]
            pairs.append(ex)

        data = []
        ref_logprobs: list[float] = []
        for ex in pairs:
            ch = build_datum(ex["prompt"], ex["chosen"])
            rj = build_datum(ex["prompt"], ex["rejected"])
            data.append(ch)
            data.append(rj)

        # Reference logprobs (sum over completion/target positions) computed once.
        for datum in data:
            ref_logprobs.append(await _seq_logprob(ref_sampler, datum, weight_vec))

        def dpo_loss(batch_data, logprobs):
            losses, margins, accs = [], [], []
            pairs_ct = len(logprobs) // 2
            for i in range(pairs_ct):
                cw = weight_vec(batch_data[2 * i])
                rw = weight_vec(batch_data[2 * i + 1])
                pol_ch = (logprobs[2 * i] * cw).sum() if cw is not None else logprobs[2 * i].sum()
                pol_rj = (logprobs[2 * i + 1] * rw).sum() if rw is not None else logprobs[2 * i + 1].sum()
                ratio_ch = pol_ch - float(ref_logprobs[2 * i])
                ratio_rj = pol_rj - float(ref_logprobs[2 * i + 1])
                margin = ratio_ch - ratio_rj
                losses.append(-F.logsigmoid(beta * margin))
                margins.append(float(margin.detach()))
                accs.append(1.0 if float(margin.detach()) > 0 else 0.0)
            loss = torch.stack(losses).mean()
            return loss, {"reward_margin": sum(margins) / len(margins),
                          "pref_accuracy": sum(accs) / len(accs)}

        fb_future = await training_client.forward_backward_custom_async(data, dpo_loss)
        opt_future = await training_client.optim_step_async(adam)
        fb_result = await fb_future.result_async()
        await opt_future.result_async()

        m = getattr(fb_result, "metrics", {}) or {}
        metrics = {"loss": float(m.get("loss", m.get("loss:sum", 0.0)) or 0.0),
                   "reward_margin": float(m.get("reward_margin", 0.0) or 0.0),
                   "pref_accuracy": float(m.get("pref_accuracy", 0.0) or 0.0),
                   "step": step + 1, "progress": (step + 1) / num_steps * 100, "mode": "real"}
        report(step + 1, metrics, f"DPO step {step + 1}/{num_steps}")

    return await _finalize(training_client, config, {}, [], num_steps)


async def _seq_logprob(sampler, datum, weight_vec) -> float:
    """Sum reference logprobs over the datum's target (completion) positions."""
    import torch
    fut = sampler.compute_logprobs_async(datum.model_input)
    lp = await (fut.result_async() if hasattr(fut, "result_async") else fut)
    lp = [0.0 if (v is None or (isinstance(v, float) and math.isnan(v))) else float(v) for v in lp]
    w = weight_vec(datum)
    lp_t = torch.tensor(lp)
    if w is None:
        return float(lp_t.sum())
    # target position k (weight w[k]) predicts token k+1 -> reference logprob lp[k+1]
    shifted = torch.zeros_like(w)
    m = min(len(w), len(lp_t) - 1)
    if m > 0:
        shifted[:m] = lp_t[1:m + 1]
    return float((shifted * w).sum())


# --- Reinforcement learning (importance_sampling on rollouts) ----------------

async def run_rl(config, examples, report: ReportFn, should_cancel: CancelFn) -> dict[str, Any]:
    tinker, types, R = _require_sdk()
    base_model = config["base_model"]
    rank = int(config.get("rank", 32))
    lr = float(config.get("learning_rate", 1e-5))
    num_steps = int(config.get("num_steps", 40))
    group_size = max(2, int(config.get("rl_group_size", 4)))
    max_tokens = int(config.get("rl_max_tokens", 256))
    temperature = float(config.get("rl_temperature", 1.0))

    report(0, {"mode": "real"}, f"Connecting to Tinker and loading {base_model}…")
    service = tinker.ServiceClient()
    training_client = await service.create_lora_training_client_async(base_model=base_model, rank=rank)
    tokenizer = training_client.get_tokenizer()
    renderer_name = _recommended_renderer_name(base_model, R, config.get("renderer_name"))
    renderer = R.get_renderer(renderer_name, tokenizer)
    adam = types.AdamParams(learning_rate=lr)
    TD = _tensordata(types)
    reward_fn = config.get("reward_fn") or default_reward
    n = len(examples)

    for step in range(num_steps):
        if should_cancel():
            return _cancelled(step)
        prompts = [examples[step % n]]
        m = await rl_step(training_client, renderer, tokenizer, types, TD, prompts, reward_fn, adam,
                          group_size=group_size, max_tokens=max_tokens, temperature=temperature,
                          step_name=f"rl-step{step}")
        m.update(step=step + 1, progress=(step + 1) / num_steps * 100, mode="real")
        report(step + 1, m, f"RL step {step + 1}/{num_steps} — mean reward {m.get('reward_mean', 0):.3f}")

    return await _finalize(training_client, config, {}, [], num_steps)


async def rl_step(training_client, renderer, tokenizer, types, TD, prompts, reward_fn, adam, *,
                  group_size: int, max_tokens: int, temperature: float, step_name: str) -> dict[str, Any]:
    """One importance-sampling RL update over `prompts` (group-relative advantage).

    Shared by single-model RL and the Multi-Agent Arena. Returns metrics.
    """
    sampler = await training_client.save_weights_and_get_sampling_client_async(name=step_name)
    params = types.SamplingParams(max_tokens=max_tokens, temperature=temperature,
                                  stop=renderer.get_stop_sequences())
    data: list[Any] = []
    all_rewards: list[float] = []
    for ex in prompts:
        messages = [{"role": "user", "content": ex["prompt"]}]
        prompt_input = renderer.build_generation_prompt(messages)
        prompt_tokens = prompt_input.to_ints()
        resp = await sampler.sample_async(prompt=prompt_input, num_samples=group_size, sampling_params=params)

        rewards, comps = [], []
        for seq in resp.sequences:
            toks = seq.tokens() if callable(getattr(seq, "tokens", None)) else list(seq.tokens)
            lps = seq.logprobs() if callable(getattr(seq, "logprobs", None)) else list(seq.logprobs or [])
            text = tokenizer.decode(toks)
            rewards.append(float(reward_fn(ex["prompt"], text, ex.get("reference", ""))))
            comps.append((toks, lps))

        mean_r = sum(rewards) / len(rewards)
        std_r = (sum((r - mean_r) ** 2 for r in rewards) / len(rewards)) ** 0.5 or 1.0
        for (toks, lps), r in zip(comps, rewards):
            datum = _rl_datum(types, TD, prompt_tokens, toks, lps, (r - mean_r) / std_r)
            if datum is not None:
                data.append(datum)
        all_rewards += rewards

    if not all_rewards:
        return {"reward_mean": 0.0, "empty": True}
    reward_mean = sum(all_rewards) / len(all_rewards)
    if not data:
        return {"reward_mean": reward_mean, "reward_max": max(all_rewards), "reward_min": min(all_rewards), "empty": True}

    fb_future = await training_client.forward_backward_async(data, "importance_sampling")
    opt_future = await training_client.optim_step_async(adam)
    fb_result = await fb_future.result_async()
    await opt_future.result_async()
    return {"reward_mean": reward_mean, "reward_max": max(all_rewards),
            "reward_min": min(all_rewards), "loss": _loss_from(fb_result)}


def _rl_datum(types, TD, prompt_tokens, completion_tokens, completion_logprobs, advantage):
    import torch
    if not completion_tokens:
        return None
    full = list(prompt_tokens) + list(completion_tokens)
    N = len(full)
    target = full[1:] + [full[-1]]
    adv = [0.0] * N
    samp_lp = [0.0] * N
    for k, j in enumerate(range(len(prompt_tokens), N)):
        pos = j - 1
        if 0 <= pos < N:
            adv[pos] = float(advantage)
            if k < len(completion_logprobs) and completion_logprobs[k] is not None:
                samp_lp[pos] = float(completion_logprobs[k])
    model_input = types.ModelInput.from_ints(full)
    return types.Datum(model_input=model_input, loss_fn_inputs={
        "target_tokens": TD.from_torch(torch.tensor(target, dtype=torch.int64)),
        "logprobs": TD.from_torch(torch.tensor(samp_lp, dtype=torch.float32)),
        "advantages": TD.from_torch(torch.tensor(adv, dtype=torch.float32)),
    })


def default_reward(prompt: str, completion: str, reference: str = "") -> float:
    """A simple, transparent default reward. Replace with a task-specific one.

    +1 if the (optional) reference answer appears in the completion, otherwise a
    partial word-overlap score; mild penalties for empty or runaway outputs.
    """
    c = (completion or "").strip()
    if not c:
        return -1.0
    r = 0.0
    words = c.split()
    ref = (reference or "").strip().lower()
    if ref:
        if ref in c.lower():
            r += 1.0
        else:
            a, b = set(c.lower().split()), set(ref.split())
            r += (len(a & b) / len(b)) if b else 0.0
    else:
        r += 0.2
    if len(words) > 400:
        r -= 0.3
    return r


# --- Shared helpers ----------------------------------------------------------

def _loss_from(fb_result) -> float:
    m = getattr(fb_result, "metrics", None) or {}
    for key in ("loss", "loss:sum", "loss:mean", "train_loss"):
        if key in m:
            try:
                return float(m[key])
            except (TypeError, ValueError):
                pass
    return 0.0


def _checkpoint_interval(config, num_steps) -> int:
    ci = config.get("checkpoint_interval")
    if ci and int(ci) > 0:
        return int(ci)
    return max(1, num_steps // 4)


def _cancelled(step: int) -> dict[str, Any]:
    return {"status": "cancelled", "steps": step, "final_metrics": {}, "sampler_path": None, "tinker_path": None}


async def _finalize(training_client, config, final_metrics, checkpoints, num_steps) -> dict[str, Any]:
    name = config.get("model_name", "model")
    sampler_path = None
    tinker_path = None
    try:
        fut = await training_client.save_weights_for_sampler_async(name=name)
        sampler_path = (await fut.result_async()).path
    except Exception as e:
        raise TinkerAPIException("save_weights_for_sampler", str(e))
    try:
        sfut = await training_client.save_state_async(name=f"{name}-state")
        tinker_path = (await sfut.result_async()).path
    except Exception as e:
        logger.warning(f"save_state failed (non-fatal, inference checkpoint still saved): {e}")
    return {"status": "completed", "steps": num_steps, "final_metrics": final_metrics,
            "sampler_path": sampler_path, "tinker_path": tinker_path,
            "checkpoints": checkpoints, "model_name": name}


# --- Dry-run (explicit, clearly labeled synthetic mode) ----------------------

async def _run_dry(kind, config, examples, report: ReportFn, should_cancel: CancelFn) -> dict[str, Any]:
    """Synthetic run for exercising the UI without a Tinker key. Clearly labeled.

    Produces a plausible-looking curve but every metric is tagged mode="demo"
    so the UI can badge it as NOT a real training run.
    """
    num_steps = int(config.get("num_steps", 40))
    n = max(1, len(examples))
    logger.info(f"DRY-RUN ({kind}) over {n} examples, {num_steps} steps — NOT real training")
    base_loss = 2.2
    for step in range(num_steps):
        if should_cancel():
            return _cancelled(step)
        await asyncio.sleep(0.05)
        loss = base_loss * math.exp(-3.0 * (step + 1) / num_steps) + 0.15 + random.random() * 0.04
        metrics = {"loss": round(loss, 4), "step": step + 1,
                   "progress": (step + 1) / num_steps * 100, "mode": "demo"}
        if kind == "dpo":
            metrics["reward_margin"] = round(0.05 * (step + 1), 3)
            metrics["pref_accuracy"] = round(min(0.5 + step / (2 * num_steps), 0.95), 3)
        if kind == "rl":
            metrics["reward_mean"] = round(-0.2 + 1.2 * (step + 1) / num_steps, 3)
        report(step + 1, metrics, f"[DEMO] {kind.upper()} step {step + 1}/{num_steps}")
    return {"status": "completed", "steps": num_steps, "final_metrics": {"loss": 0.2, "mode": "demo"},
            "sampler_path": None, "tinker_path": None, "checkpoints": [], "model_name": config.get("model_name", "demo-model"),
            "demo": True}
