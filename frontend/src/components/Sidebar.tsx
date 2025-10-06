import { ChevronRight, Folder, File } from 'lucide-react'
import { useState } from 'react'

interface FileTreeItem {
  name: string
  type: 'file' | 'folder'
  children?: FileTreeItem[]
}

const mockFileTree: FileTreeItem[] = [
  {
    name: 'agents',
    type: 'folder',
    children: [
      { name: 'code_review_agent.py', type: 'file' },
      { name: 'reward_model.py', type: 'file' },
    ]
  },
  {
    name: 'training',
    type: 'folder',
    children: [
      { name: 'rlhf_pipeline.py', type: 'file' },
      { name: 'configs.py', type: 'file' },
    ]
  },
  {
    name: 'data',
    type: 'folder',
    children: [
      { name: 'code_reviews.jsonl', type: 'file' },
      { name: 'preferences.jsonl', type: 'file' },
    ]
  },
  { name: 'main.py', type: 'file' },
  { name: 'requirements.txt', type: 'file' },
]

function TreeItem({ item, level = 0 }: { item: FileTreeItem; level?: number }) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div>
      <div
        className="flex items-center gap-2 px-2 py-1 hover:bg-dark-hover cursor-pointer rounded transition-colors"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => item.type === 'folder' && setIsOpen(!isOpen)}
      >
        {item.type === 'folder' && (
          <ChevronRight
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
        )}
        {item.type === 'folder' ? (
          <Folder className="w-4 h-4 text-brain-blue-400" />
        ) : (
          <File className="w-4 h-4 text-dark-text-secondary" />
        )}
        <span className="text-sm">{item.name}</span>
      </div>
      {item.type === 'folder' && isOpen && item.children && (
        <div>
          {item.children.map((child, idx) => (
            <TreeItem key={idx} item={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  return (
    <div className="w-64 bg-dark-surface border-r border-dark-border flex flex-col overflow-hidden">
      <div className="panel-header">
        <span className="text-sm font-semibold">EXPLORER</span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {mockFileTree.map((item, idx) => (
          <TreeItem key={idx} item={item} />
        ))}
      </div>

      <div className="border-t border-dark-border p-2">
        <div className="text-xs text-dark-text-secondary flex items-center gap-2">
          <span className="led led-green"></span>
          <span>Backend Connected</span>
        </div>
      </div>
    </div>
  )
}
