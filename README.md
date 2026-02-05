# Madn8n

A node-based flow editor built with React, TypeScript, and ReactFlow. Create and connect nodes on an interactive canvas with support for branching nodes and dynamic connections.

## TODO

- maddie fication
    - main menu
    - two way conversion between reactflow and maddie json
- features
    - text editor
- maintenance
    - refactoring
    - unit
    - cypress

## Features

- Drag and drop nodes onto the canvas
- Connect nodes with visual edges
- Branching nodes with multiple output nodes
- Interactive toolbar with zoom and view controls
- Node popup menus for configuration

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
# or
yarn install
```

### Development

```bash
# Start development server
npm run dev
# or
yarn dev
```

The application will be available at `http://localhost:5173`

### Build

```bash
# Build for production
npm run build
# or
yarn build
```

### Preview Production Build

```bash
# Preview production build
npm run preview
# or
yarn preview
```

## Project Structure

- `src/App.tsx` - Main application component
- `src/components/` - React components (Toolbar, FlowCanvas, NodePopupMenu, etc.)
- `src/DynamicNode.tsx` - Standard node component
- `src/BranchingNode.tsx` - Branching node wrapper component
- `src/BranchingNodeOutput.tsx` - Output node component
- `src/modules.ts` - Node type definitions
