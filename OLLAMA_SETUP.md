# Ollama Setup for AI Training Assistant

The AI Training Assistant in Thinker uses **Ollama** to provide intelligent, context-aware help for training models with the Tinker SDK.

## What is Ollama?

Ollama is a lightweight framework that lets you run large language models locally on your machine. It's free, open-source, and works great for powering the AI assistant.

## Installation

### macOS / Linux

```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### Windows

Download the installer from [https://ollama.ai/download](https://ollama.ai/download)

## Quick Start

1. **Install Ollama** (see above)

2. **Pull a model** (recommended: llama3.2)
   ```bash
   ollama pull llama3.2
   ```

3. **Verify it's running**
   ```bash
   ollama list
   ```

4. **Configure Thinker** (optional - defaults work out of the box)

   In your `.env` file:
   ```bash
   OLLAMA_URL=http://localhost:11434
   OLLAMA_MODEL=llama3.2
   ```

5. **Start using the AI Assistant** in Thinker!

## Recommended Models

### For Best Performance (if you have GPU/good CPU):
- `llama3.2` (3B parameters) - Fast and capable
- `llama3.1:8b` (8B parameters) - More powerful
- `mistral` (7B parameters) - Good balance

### For Lower-end Machines:
- `llama3.2:1b` (1B parameters) - Very fast, decent quality
- `phi3` (3.8B parameters) - Small but capable

### To pull a different model:
```bash
ollama pull llama3.1:8b
```

Then update your `.env`:
```bash
OLLAMA_MODEL=llama3.1:8b
```

## What the AI Assistant Can Do

With Ollama running, the AI assistant can help you with:

- **Understanding Thinker**: Explain the different views and features
- **Choosing Training Types**: Help decide between SL, RL, RLHF, DPO
- **Configuring Jobs**: Suggest hyperparameters based on your dataset
- **Troubleshooting**: Debug training issues like increasing loss
- **Dataset Formatting**: Guide you on proper data formats
- **Tinker SDK**: Answer questions about Tinker capabilities

## Fallback Mode

If Ollama is not available, the AI assistant will fall back to a pattern-matching mode with pre-programmed responses. You'll see a yellow indicator in the UI:

🟡 **Ollama unavailable (using fallback)**

The fallback mode still works but has limited capabilities.

## Troubleshooting

### "Connection refused" error

Make sure Ollama is running:
```bash
ollama serve
```

### "Model not found" error

Pull the model first:
```bash
ollama pull llama3.2
```

### Slow responses

Try a smaller model:
```bash
ollama pull llama3.2:1b
```

### Check Ollama status

```bash
curl http://localhost:11434/api/tags
```

Should return a list of installed models.

## Advanced Configuration

### Custom Ollama URL

If running Ollama on a different machine:
```bash
OLLAMA_URL=http://192.168.1.100:11434
```

### GPU Acceleration

Ollama automatically uses GPU if available (NVIDIA, AMD, Apple Silicon).

Check GPU usage:
```bash
ollama ps
```

## Performance Tips

1. **Use the right model size** for your hardware
2. **Keep Ollama running** in the background for faster responses
3. **Pull models ahead of time** to avoid delays
4. **Use SSD storage** for better model loading times

## More Information

- Official Ollama docs: https://ollama.ai/docs
- Model library: https://ollama.ai/library
- GitHub: https://github.com/ollama/ollama

---

**Questions?** The AI assistant itself can help! Just ask "How do I set up Ollama?" when it's running.
