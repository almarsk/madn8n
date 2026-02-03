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
          style={t.name === 'Branching' ? { fontWeight: '600', borderColor: 'rgba(96, 165, 250, 0.6)' } : {}}
        >
          {t.name}
        </div>
      ))}
    </div>
  )
}
