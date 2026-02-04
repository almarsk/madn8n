interface NodeListProps {
  modules: Array<{ name: string; description: string; params: Record<string, string> }>
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
