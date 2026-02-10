# Madn8n

A node-based flow editor built with React, TypeScript, and ReactFlow. Create and connect nodes on an interactive canvas with support for branching nodes and dynamic connections.

## TODO

- testing
  - manual testing
    - small stuff
      - simplify api for menu displaying - setToolbarMenu("stickers"|"mainConfig")
        - menu buttons highlight
      - flow canvas componetn should go
      - handle label click is a rudiment
      - simplify z index system - remove old related stuff
        - latest clicked/added/dragged is highest
        - move to top button in menu
      - remove debug logging to agent
      - explicit edge deletion
      - json editor buttons
        - validate only type check
        - buttons same width
      - default node labels ?
    - autolayout test
    - history (undo/redo) works poorly with deletion
      - when reactflow changes it waits 1s and saves
      - unless its a undo/redo
    - edges more angular?
    - x to delete node search bar
  - run `yarn eslint . --fix; yarn tsc` and fix issues
  - code review
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
