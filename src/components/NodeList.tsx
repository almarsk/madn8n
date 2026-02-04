import { type Module } from '../modules'

interface NodeListProps {
  modules: Module[]
  onNodeDragStart: (type: string) => (event: React.DragEvent) => void
  onSidebarNodeClick: (moduleName: string) => void
}

export default function NodeList({ modules, onNodeDragStart, onSidebarNodeClick }: NodeListProps) {
  return (
    <div className="nodes-list">
      {modules.map((module) => (
        <div
          key={module.name}
          className="sidebar-node"
          onDragStart={onNodeDragStart(module.name)}
          onClick={() => onSidebarNodeClick(module.name)}
          draggable
        >
          {module.name}
        </div>
      ))}
    </div>
  )
}
