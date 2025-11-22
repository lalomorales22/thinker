import { useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, Eye, Upload, X } from 'lucide-react'

interface DatasetValidatorProps {
  file: File | null
  onValidationComplete: (isValid: boolean, preview?: any) => void
  onClose: () => void
}

interface ValidationResult {
  isValid: boolean
  format: 'jsonl' | 'json' | 'csv' | 'unknown'
  errors: string[]
  warnings: string[]
  stats: {
    totalExamples: number
    avgLength: number
    fields: string[]
  }
  preview: any[]
}

export default function DatasetValidator({ file, onValidationComplete, onClose }: DatasetValidatorProps) {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  const detectFormat = (filename: string, content: string): 'jsonl' | 'json' | 'csv' | 'unknown' => {
    const ext = filename.split('.').pop()?.toLowerCase()

    if (ext === 'jsonl') return 'jsonl'
    if (ext === 'json') return 'json'
    if (ext === 'csv') return 'csv'

    // Try to detect from content
    try {
      JSON.parse(content)
      return 'json'
    } catch {
      if (content.includes(',') && content.includes('\n')) {
        return 'csv'
      }
      // Try JSONL
      const lines = content.split('\n').filter(l => l.trim())
      if (lines.length > 0) {
        try {
          JSON.parse(lines[0])
          return 'jsonl'
        } catch {
          // Not JSONL
        }
      }
    }

    return 'unknown'
  }

  const validateJSONL = (content: string): ValidationResult => {
    const lines = content.split('\n').filter(l => l.trim())
    const errors: string[] = []
    const warnings: string[] = []
    const preview: any[] = []
    let totalLength = 0
    const fieldSets: Set<string>[] = []

    lines.forEach((line, idx) => {
      try {
        const obj = JSON.parse(line)
        if (idx < 5) preview.push(obj)

        // Check for common fields
        const fields = Object.keys(obj)
        fieldSets.push(new Set(fields))

        // Calculate average text length
        const textContent = JSON.stringify(obj)
        totalLength += textContent.length

        // Check for required fields (common patterns)
        if (!obj.input && !obj.prompt && !obj.question && !obj.text) {
          warnings.push(`Line ${idx + 1}: No standard input field found (input/prompt/question/text)`)
        }
        if (!obj.output && !obj.completion && !obj.answer && !obj.response) {
          warnings.push(`Line ${idx + 1}: No standard output field found (output/completion/answer/response)`)
        }
      } catch (e) {
        errors.push(`Line ${idx + 1}: Invalid JSON - ${e}`)
      }
    })

    // Check field consistency
    const allFields = new Set<string>()
    fieldSets.forEach(fs => fs.forEach(f => allFields.add(f)))

    if (fieldSets.length > 0) {
      const firstFields = fieldSets[0]
      fieldSets.forEach((fs, idx) => {
        if (fs.size !== firstFields.size || ![...fs].every(f => firstFields.has(f))) {
          warnings.push(`Line ${idx + 1}: Inconsistent fields compared to first line`)
        }
      })
    }

    return {
      isValid: errors.length === 0,
      format: 'jsonl',
      errors,
      warnings: warnings.slice(0, 5), // Limit to first 5 warnings
      stats: {
        totalExamples: lines.length,
        avgLength: Math.round(totalLength / lines.length),
        fields: [...allFields]
      },
      preview
    }
  }

  const validateJSON = (content: string): ValidationResult => {
    const errors: string[] = []
    const warnings: string[] = []
    const preview: any[] = []

    try {
      const data = JSON.parse(content)

      if (!Array.isArray(data)) {
        errors.push('JSON must be an array of objects')
        return {
          isValid: false,
          format: 'json',
          errors,
          warnings,
          stats: { totalExamples: 0, avgLength: 0, fields: [] },
          preview: []
        }
      }

      let totalLength = 0
      const fieldSets: Set<string>[] = []

      data.forEach((obj: any, idx: number) => {
        if (typeof obj !== 'object') {
          errors.push(`Item ${idx + 1}: Must be an object, got ${typeof obj}`)
          return
        }

        if (idx < 5) preview.push(obj)

        const fields = Object.keys(obj)
        fieldSets.push(new Set(fields))
        totalLength += JSON.stringify(obj).length

        if (!obj.input && !obj.prompt && !obj.question && !obj.text) {
          warnings.push(`Item ${idx + 1}: No standard input field found`)
        }
        if (!obj.output && !obj.completion && !obj.answer && !obj.response) {
          warnings.push(`Item ${idx + 1}: No standard output field found`)
        }
      })

      const allFields = new Set<string>()
      fieldSets.forEach(fs => fs.forEach(f => allFields.add(f)))

      return {
        isValid: errors.length === 0,
        format: 'json',
        errors,
        warnings: warnings.slice(0, 5),
        stats: {
          totalExamples: data.length,
          avgLength: Math.round(totalLength / data.length),
          fields: [...allFields]
        },
        preview
      }
    } catch (e) {
      errors.push(`Invalid JSON: ${e}`)
      return {
        isValid: false,
        format: 'json',
        errors,
        warnings,
        stats: { totalExamples: 0, avgLength: 0, fields: [] },
        preview: []
      }
    }
  }

  const validateCSV = (content: string): ValidationResult => {
    const errors: string[] = []
    const warnings: string[] = []
    const preview: any[] = []

    const lines = content.split('\n').filter(l => l.trim())
    if (lines.length < 2) {
      errors.push('CSV must have at least a header row and one data row')
      return {
        isValid: false,
        format: 'csv',
        errors,
        warnings,
        stats: { totalExamples: 0, avgLength: 0, fields: [] },
        preview: []
      }
    }

    const headers = lines[0].split(',').map(h => h.trim())
    let totalLength = 0

    for (let i = 1; i < Math.min(6, lines.length); i++) {
      const values = lines[i].split(',').map(v => v.trim())
      if (values.length !== headers.length) {
        warnings.push(`Row ${i}: Column count mismatch (expected ${headers.length}, got ${values.length})`)
      }

      const obj: any = {}
      headers.forEach((h, idx) => {
        obj[h] = values[idx] || ''
      })

      if (i < 6) preview.push(obj)
      totalLength += lines[i].length
    }

    if (!headers.includes('input') && !headers.includes('prompt') && !headers.includes('question')) {
      warnings.push('No standard input column found (input/prompt/question)')
    }
    if (!headers.includes('output') && !headers.includes('completion') && !headers.includes('answer')) {
      warnings.push('No standard output column found (output/completion/answer)')
    }

    return {
      isValid: errors.length === 0,
      format: 'csv',
      errors,
      warnings,
      stats: {
        totalExamples: lines.length - 1,
        avgLength: Math.round(totalLength / (lines.length - 1)),
        fields: headers
      },
      preview
    }
  }

  const validateFile = async () => {
    if (!file) return

    setIsValidating(true)

    try {
      const content = await file.text()
      const format = detectFormat(file.name, content)

      let result: ValidationResult

      if (format === 'jsonl') {
        result = validateJSONL(content)
      } else if (format === 'json') {
        result = validateJSON(content)
      } else if (format === 'csv') {
        result = validateCSV(content)
      } else {
        result = {
          isValid: false,
          format: 'unknown',
          errors: ['Unsupported file format. Please use JSONL, JSON, or CSV'],
          warnings: [],
          stats: { totalExamples: 0, avgLength: 0, fields: [] },
          preview: []
        }
      }

      setValidationResult(result)
      onValidationComplete(result.isValid, result.preview)
    } catch (error) {
      setValidationResult({
        isValid: false,
        format: 'unknown',
        errors: [`Failed to read file: ${error}`],
        warnings: [],
        stats: { totalExamples: 0, avgLength: 0, fields: [] },
        preview: []
      })
      onValidationComplete(false)
    } finally {
      setIsValidating(false)
    }
  }

  // Auto-validate on mount
  useState(() => {
    if (file) validateFile()
  })

  if (!validationResult && isValidating) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="tactical-panel-elevated w-full max-w-2xl">
          <div className="tactical-panel-header">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-led-cyan animate-pulse" />
              <span className="font-semibold uppercase tracking-wide">Validating Dataset...</span>
            </div>
          </div>
          <div className="p-6 text-center">
            <div className="text-tactical-text-secondary">Analyzing file structure and content...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!validationResult) return null

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="tactical-panel-elevated w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="tactical-panel-header sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {validationResult.isValid ? (
              <CheckCircle className="w-4 h-4 text-led-green" />
            ) : (
              <XCircle className="w-4 h-4 text-led-red" />
            )}
            <span className="font-semibold uppercase tracking-wide">
              Dataset Validation {validationResult.isValid ? 'Passed' : 'Failed'}
            </span>
          </div>
          <button className="btn btn-ghost btn-xs p-1" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Status Summary */}
          <div className={`tactical-panel p-4 border-l-4 ${
            validationResult.isValid ? 'border-led-green bg-led-green/10' : 'border-led-red bg-led-red/10'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {validationResult.isValid ? (
                  <CheckCircle className="w-5 h-5 text-led-green" />
                ) : (
                  <XCircle className="w-5 h-5 text-led-red" />
                )}
                <h3 className="font-semibold">
                  {validationResult.isValid ? 'Dataset is valid and ready to upload' : 'Dataset has errors'}
                </h3>
              </div>
              <span className="px-2 py-1 rounded-tactical text-xs font-mono bg-obsidian-surface">
                {validationResult.format.toUpperCase()}
              </span>
            </div>
            {file && (
              <p className="text-sm text-tactical-text-secondary">
                File: <span className="font-mono">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {/* Errors */}
          {validationResult.errors.length > 0 && (
            <div className="tactical-panel p-4 border border-led-red/30 bg-led-red/10">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-4 h-4 text-led-red" />
                <h3 className="font-semibold text-led-red">Errors ({validationResult.errors.length})</h3>
              </div>
              <ul className="space-y-1 text-sm text-tactical-text-secondary">
                {validationResult.errors.map((error, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-led-red">•</span>
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {validationResult.warnings.length > 0 && (
            <div className="tactical-panel p-4 border border-led-yellow/30 bg-led-yellow/10">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-led-yellow" />
                <h3 className="font-semibold text-led-yellow">Warnings ({validationResult.warnings.length})</h3>
              </div>
              <ul className="space-y-1 text-sm text-tactical-text-secondary">
                {validationResult.warnings.map((warning, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-led-yellow">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Statistics */}
          <div className="tactical-panel p-4">
            <h3 className="font-semibold mb-3">Dataset Statistics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-tactical-text-secondary uppercase mb-1">Total Examples</div>
                <div className="text-2xl font-bold text-led-cyan">{validationResult.stats.totalExamples.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-tactical-text-secondary uppercase mb-1">Avg Length</div>
                <div className="text-2xl font-bold text-led-green">{validationResult.stats.avgLength.toLocaleString()} chars</div>
              </div>
              <div>
                <div className="text-xs text-tactical-text-secondary uppercase mb-1">Fields</div>
                <div className="text-2xl font-bold text-led-purple">{validationResult.stats.fields.length}</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xs text-tactical-text-secondary uppercase mb-2">Detected Fields</div>
              <div className="flex flex-wrap gap-2">
                {validationResult.stats.fields.map((field, idx) => (
                  <span key={idx} className="px-2 py-1 rounded-tactical text-xs font-mono bg-obsidian-surface border border-obsidian-border">
                    {field}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          {validationResult.preview.length > 0 && (
            <div className="tactical-panel p-4">
              <h3 className="font-semibold mb-3">Preview (First {validationResult.preview.length} examples)</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {validationResult.preview.map((example, idx) => (
                  <div key={idx} className="bg-obsidian-surface rounded-tactical p-3 border border-obsidian-border">
                    <div className="text-xs text-tactical-text-muted mb-2">Example {idx + 1}</div>
                    <div className="space-y-2">
                      {Object.entries(example).map(([key, value]) => (
                        <div key={key} className="text-sm">
                          <span className="text-led-cyan font-mono">{key}:</span>
                          <pre className="mt-1 text-tactical-text-secondary whitespace-pre-wrap font-mono text-xs">
                            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Fixes */}
          {!validationResult.isValid && (
            <div className="tactical-panel p-4 bg-led-cyan/10 border border-led-cyan/30">
              <h3 className="font-semibold text-led-cyan mb-2">Suggested Fixes</h3>
              <ul className="space-y-1 text-sm text-tactical-text-secondary">
                {validationResult.format === 'unknown' && (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-led-cyan">•</span>
                      <span>Ensure file extension is .jsonl, .json, or .csv</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-led-cyan">•</span>
                      <span>For JSONL: Each line should be a valid JSON object</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-led-cyan">•</span>
                      <span>For JSON: File should contain an array of objects</span>
                    </li>
                  </>
                )}
                {validationResult.errors.some(e => e.includes('Invalid JSON')) && (
                  <li className="flex items-start gap-2">
                    <span className="text-led-cyan">•</span>
                    <span>Check for syntax errors: missing quotes, commas, or brackets</span>
                  </li>
                )}
                {validationResult.warnings.some(w => w.includes('input field')) && (
                  <li className="flex items-start gap-2">
                    <span className="text-led-cyan">•</span>
                    <span>Add an "input", "prompt", "question", or "text" field for training inputs</span>
                  </li>
                )}
                {validationResult.warnings.some(w => w.includes('output field')) && (
                  <li className="flex items-start gap-2">
                    <span className="text-led-cyan">•</span>
                    <span>Add an "output", "completion", "answer", or "response" field for training targets</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 pt-0 border-t border-obsidian-border">
          <button className="btn btn-ghost" onClick={onClose}>
            {validationResult.isValid ? 'Cancel' : 'Fix Issues'}
          </button>
          {validationResult.isValid && (
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={() => {
                onValidationComplete(true, validationResult.preview)
                onClose()
              }}
            >
              <Upload className="w-4 h-4" />
              Proceed with Upload
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
