interface NodeListProps {
  modules: Array<{ name: string; description: string; params: Record<string, string> }>
  onNodeDragStart: (type: string) => (event: React.DragEvent) => void
  onSidebarNodeClick: (moduleName: string) => void
}

export default function NodeList({ modules, onNodeDragStart, onSidebarNodeClick }: NodeListProps) {
  return (
    <div className="nodes-list">
      {modules.map((t) => (
        <div
          key={t.name}
          className="sidebar-node sidebar-node-a"
          onDragStart={onNodeDragStart(t.name)}
          onClick={() => onSidebarNodeClick(t.name)}
          draggable
        >
          {t.name}
        </div>
      ))}
    </div>
  )
}
