import { type Module } from '../modules'

interface NodeListProps {
  modules: Module[]
  onNodeDragStart: (type: string) => (event: React.DragEvent) => void
  onSidebarNodeClick: (moduleName: string) => void
}

export default function NodeList({ modules, onNodeDragStart, onSidebarNodeClick }: NodeListProps) {
  // Filter modules to only show those that should appear in toolbar
  const visibleModules = modules.filter((module) => module.showInToolbar !== false)
  
  return (
    <div className="nodes-list">
      {visibleModules.map((module) => (
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
