import React, { useState, useEffect } from 'react';
import { Search, Download, ChevronRight, Check, X, Loader2, Database, Info, AlertCircle } from 'lucide-react';

interface FieldMapping {
  source_field: string;
  target_field: string;
}

interface DatasetSearchResult {
  name: string;
  description: string;
  downloads: number;
  likes: number;
  tags: string[];
  size?: string;
}

interface DatasetInfo {
  name: string;
  description: string;
  splits: string[];
  features: { [key: string]: string };
  num_rows: { [key: string]: number };
}

interface HuggingFaceImporterProps {
  onImportComplete?: (datasetId: string) => void;
  onClose?: () => void;
}

export default function HuggingFaceImporter({ onImportComplete, onClose }: HuggingFaceImporterProps) {
  const [step, setStep] = useState(1); // 1: Search, 2: Select Split, 3: Map Fields, 4: Preview, 5: Import
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DatasetSearchResult[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<DatasetSearchResult | null>(null);
  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo | null>(null);
  const [selectedSplit, setSelectedSplit] = useState('train');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [previewSamples, setPreviewSamples] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [trainingType, setTrainingType] = useState<'SL' | 'DPO'>('SL');

  const searchDatasets = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/huggingface/search?query=${searchQuery}&limit=10`);
      const data = await response.json();
      setSearchResults(data.datasets || []);
    } catch (error) {
      console.error('Error searching datasets:', error);
    }
  };

  const selectDataset = async (dataset: DatasetSearchResult) => {
    setSelectedDataset(dataset);
    try {
      const response = await fetch(`http://localhost:8000/api/huggingface/info/${encodeURIComponent(dataset.name)}`);
      const info = await response.json();
      setDatasetInfo(info);
      setSelectedSplit(info.splits[0] || 'train');
      setStep(2);
    } catch (error) {
      console.error('Error fetching dataset info:', error);
    }
  };

  const suggestFieldMappings = async () => {
    if (!selectedDataset) return;

    try {
      const response = await fetch(
        `http://localhost:8000/api/huggingface/suggest-mapping?dataset_name=${encodeURIComponent(selectedDataset.name)}&training_type=${trainingType}`
      );
      const data = await response.json();
      const mappings = data.suggestions.map((s: any) => ({
        source_field: s.source_field,
        target_field: s.target_field
      }));
      setFieldMappings(mappings);
    } catch (error) {
      console.error('Error suggesting mappings:', error);
    }
  };

  const loadPreview = async () => {
    if (!selectedDataset) return;

    try {
      const response = await fetch('http://localhost:8000/api/huggingface/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_name: selectedDataset.name,
          split: selectedSplit,
          num_samples: 3,
          field_mappings: fieldMappings.map(m => ({
            source_field: m.source_field,
            target_field: m.target_field
          }))
        })
      });
      const data = await response.json();
      setPreviewSamples(data.samples || []);
    } catch (error) {
      console.error('Error loading preview:', error);
    }
  };

  const importDataset = async () => {
    if (!selectedDataset) return;

    setImporting(true);
    try {
      const response = await fetch('http://localhost:8000/api/huggingface/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_name: selectedDataset.name,
          split: selectedSplit,
          field_mappings: fieldMappings,
          max_samples: 1000 // Limit for demo
        })
      });

      const data = await response.json();

      // Simulate progress updates
      for (let i = 0; i <= 100; i += 10) {
        setImportProgress(i);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      if (onImportComplete) {
        onImportComplete(data.dataset_id);
      }

      setStep(5);
    } catch (error) {
      console.error('Error importing dataset:', error);
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (step === 3) {
      suggestFieldMappings();
    } else if (step === 4) {
      loadPreview();
    }
  }, [step]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-xl font-semibold text-white">Import from HuggingFace</h2>
              <p className="text-sm text-gray-400">Browse and import datasets from HuggingFace Hub</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 bg-gray-900/50 border-b border-gray-800">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {['Search', 'Select Split', 'Map Fields', 'Preview', 'Import'].map((label, idx) => (
              <div key={idx} className="flex items-center">
                <div className={`flex items-center gap-2 ${step > idx + 1 ? 'text-green-400' : step === idx + 1 ? 'text-cyan-400' : 'text-gray-600'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    step > idx + 1 ? 'border-green-400 bg-green-400/20' :
                    step === idx + 1 ? 'border-cyan-400 bg-cyan-400/20' :
                    'border-gray-600'
                  }`}>
                    {step > idx + 1 ? <Check className="w-4 h-4" /> : idx + 1}
                  </div>
                  <span className="text-xs font-medium hidden sm:block">{label}</span>
                </div>
                {idx < 4 && <ChevronRight className="w-4 h-4 text-gray-600 mx-2" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Search */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Search Datasets
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchDatasets()}
                      placeholder="e.g., ultrafeedback, alpaca, gsm8k..."
                      className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </div>
                  <button
                    onClick={searchDatasets}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
                  >
                    Search
                  </button>
                </div>
              </div>

              {/* Search Results */}
              <div className="space-y-3">
                {searchResults.map((dataset, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectDataset(dataset)}
                    className="p-4 bg-gray-900/50 border border-gray-800 rounded-lg hover:border-cyan-500/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-white mb-1">{dataset.name}</h3>
                        <p className="text-xs text-gray-400 mb-2">{dataset.description}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>📥 {dataset.downloads.toLocaleString()} downloads</span>
                          <span>❤️ {dataset.likes} likes</span>
                          {dataset.size && <span>💾 {dataset.size}</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {dataset.tags.map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 bg-cyan-900/30 text-cyan-300 text-xs rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Select Split */}
          {step === 2 && datasetInfo && (
            <div className="space-y-6">
              <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                <h3 className="text-lg font-semibold text-white mb-2">{datasetInfo.name}</h3>
                <p className="text-sm text-gray-400 mb-4">{datasetInfo.description}</p>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Splits:</span>
                    <span className="ml-2 text-white">{datasetInfo.splits.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Features:</span>
                    <span className="ml-2 text-white">{Object.keys(datasetInfo.features).length}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Split
                </label>
                <select
                  value={selectedSplit}
                  onChange={(e) => setSelectedSplit(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  {datasetInfo.splits.map(split => (
                    <option key={split} value={split}>
                      {split} ({datasetInfo.num_rows[split]?.toLocaleString() || 0} samples)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Training Type
                </label>
                <select
                  value={trainingType}
                  onChange={(e) => setTrainingType(e.target.value as 'SL' | 'DPO')}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <option value="SL">Supervised Learning (SL)</option>
                  <option value="DPO">Direct Preference Optimization (DPO)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
                >
                  Next: Map Fields
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Map Fields */}
          {step === 3 && datasetInfo && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-200">
                  <p className="font-semibold mb-1">Field Mapping</p>
                  <p className="text-blue-300">Map dataset fields to training format. Suggested mappings are auto-detected.</p>
                </div>
              </div>

              <div className="space-y-3">
                {fieldMappings.map((mapping, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Source Field</label>
                      <input
                        type="text"
                        value={mapping.source_field}
                        readOnly
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
                      />
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-600 mt-5" />
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Target Field</label>
                      <select
                        value={mapping.target_field}
                        onChange={(e) => {
                          const newMappings = [...fieldMappings];
                          newMappings[idx].target_field = e.target.value;
                          setFieldMappings(newMappings);
                        }}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      >
                        <option value="prompt">Prompt</option>
                        <option value="completion">Completion</option>
                        {trainingType === 'DPO' && (
                          <>
                            <option value="chosen">Chosen</option>
                            <option value="rejected">Rejected</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
                >
                  Next: Preview
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Preview */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg flex items-start gap-3">
                <Info className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-200">
                  <p className="font-semibold mb-1">Preview Dataset</p>
                  <p className="text-green-300">Review how the data will look after mapping. First 3 samples shown.</p>
                </div>
              </div>

              <div className="space-y-4">
                {previewSamples.map((sample, idx) => (
                  <div key={idx} className="p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                    <div className="text-xs text-gray-500 mb-2">Sample {idx + 1}</div>
                    {Object.entries(sample).map(([key, value]) => (
                      <div key={key} className="mb-2">
                        <span className="text-xs font-semibold text-cyan-400">{key}:</span>
                        <p className="text-sm text-gray-300 mt-1 pl-2">{String(value).substring(0, 200)}...</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={importDataset}
                  disabled={importing}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Import Dataset
                    </>
                  )}
                </button>
              </div>

              {importing && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                    <span>Importing dataset...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 5 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Import Complete!</h3>
              <p className="text-gray-400 text-center max-w-md mb-6">
                Dataset has been successfully imported and is now available for training.
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
