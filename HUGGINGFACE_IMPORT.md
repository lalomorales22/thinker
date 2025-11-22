# 🤗 HuggingFace Dataset Import

## Overview

Thinker now supports **git-clone style** dataset importing from HuggingFace Hub! This feature allows you to search, browse, and import thousands of public datasets directly into your training workflow.

## Features

✅ **Search HuggingFace Hub** - Search through thousands of datasets by name or description
✅ **Dataset Preview** - Preview dataset structure and samples before importing
✅ **Automatic Field Mapping** - Smart field mapping suggestions based on training type
✅ **Multi-Split Support** - Import train, validation, or test splits
✅ **Progress Tracking** - Real-time progress updates during download and conversion
✅ **DPO & SL Support** - Automatic mapping for both Supervised Learning and DPO training types

## How to Use

### 1. Open Dataset Manager

Navigate to the **Dataset Manager** view in Thinker.

### 2. Click "Import from HuggingFace"

Click the button with the git branch icon to open the HuggingFace Importer modal.

### 3. Search for Datasets

Search for datasets by name or keywords:
- `ultrafeedback` - For DPO preference datasets
- `alpaca` - For instruction-following datasets
- `gsm8k` - For math reasoning datasets
- `no_robots` - For conversation datasets

### 4. Select Dataset & Split

1. Click on a dataset from search results
2. Choose which split to import (train, test, validation)
3. Select training type (SL or DPO)

### 5. Review Field Mappings

The system will automatically suggest field mappings:
- For **SL**: `prompt` → `completion`
- For **DPO**: `prompt` → `chosen` → `rejected`

You can customize these mappings if needed.

### 6. Preview & Import

1. Preview the first few samples to verify the mapping
2. Click "Import Dataset" to start the download
3. Monitor progress as the dataset downloads and converts

### 7. Use in Training

Once imported, the dataset will appear in your Dataset Manager and can be used for training jobs!

## Installation

### Backend Requirements

Install the HuggingFace datasets library:

```bash
cd backend
pip install -r requirements.txt
```

This will install:
- `datasets==3.1.0` - HuggingFace datasets library
- `huggingface-hub==0.26.2` - HuggingFace Hub API client

### Optional: Authentication

For private or gated datasets, set your HuggingFace token:

```bash
export HUGGINGFACE_TOKEN=your_token_here
```

Or use the HuggingFace CLI:

```bash
huggingface-cli login
```

## Recommended Datasets

### For DPO Training

- **HuggingFaceH4/ultrafeedback_binarized** - 61K binary preference pairs
- **Anthropic/hh-rlhf** - 160K helpful/harmless preferences

### For Supervised Learning

- **HuggingFaceH4/no_robots** - 9.5K high-quality conversations
- **tatsu-lab/alpaca** - 52K instruction-following examples
- **openai/gsm8k** - 7.5K math word problems

### For Code Training

- **bigcode/the-stack** - Large code dataset (warning: very large!)
- **openai/humaneval** - 164 Python code evaluation examples

## Technical Details

### API Endpoints

- `GET /api/huggingface/search` - Search datasets
- `GET /api/huggingface/info/{dataset_name}` - Get dataset info
- `POST /api/huggingface/suggest-mapping` - Get field mapping suggestions
- `POST /api/huggingface/preview` - Preview dataset samples
- `POST /api/huggingface/import` - Import dataset
- `GET /api/huggingface/import-progress/{import_id}` - Check import progress
- `GET /api/huggingface/popular` - Get popular datasets by category

### Data Flow

1. **Search** → HuggingFace Hub API returns dataset list
2. **Select** → Load dataset metadata (splits, features, row counts)
3. **Map** → Suggest field mappings based on dataset structure
4. **Preview** → Stream first N samples using HuggingFace datasets library
5. **Import** → Download full dataset, convert to JSONL, save to `backend/data/`

### File Format

Imported datasets are saved as JSONL files:

```jsonl
{"prompt": "...", "completion": "..."}
{"prompt": "...", "completion": "..."}
```

For DPO datasets:

```jsonl
{"prompt": "...", "chosen": "...", "rejected": "..."}
{"prompt": "...", "chosen": "...", "rejected": "..."}
```

## Troubleshooting

### Library Not Installed

If you see mock data instead of real HuggingFace datasets:
1. Check that `datasets` and `huggingface-hub` are installed
2. Run `pip install datasets huggingface-hub`
3. Restart the backend server

### Import Fails

Common issues:
- **Dataset not found** - Check dataset name spelling
- **Network errors** - Check internet connection
- **Large datasets** - Use `max_samples` parameter to limit size
- **Authentication required** - Set `HUGGINGFACE_TOKEN` for gated datasets

### Slow Downloads

HuggingFace datasets are cached locally after first download. Subsequent imports of the same dataset will be much faster.

Cache location: `~/.cache/huggingface/datasets/`

## Limitations

- Import progress is estimated (HuggingFace doesn't provide real-time download progress)
- Very large datasets (>1GB) may take several minutes to import
- Streaming mode is used for preview, but full download for import
- Field mapping is automatic but may need manual adjustment for complex datasets

## Future Enhancements

- [ ] Support for dataset subsets/configs
- [ ] Parallel chunk downloading for large datasets
- [ ] Dataset preview with syntax highlighting
- [ ] Save field mapping templates
- [ ] Resume interrupted downloads
- [ ] Import multiple splits at once

## Resources

- [HuggingFace Datasets Documentation](https://huggingface.co/docs/datasets)
- [HuggingFace Hub](https://huggingface.co/datasets)
- [Dataset Search](https://huggingface.co/datasets)

---

Made with ❤️ by lalo for Mira
