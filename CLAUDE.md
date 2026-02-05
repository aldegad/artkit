# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server on http://localhost:3005
npm run build    # Build for production (static export to /out)
npm run lint     # Run ESLint
npm run deploy   # Build and deploy to Firebase Hosting
```

## Git Worktrees

병렬 작업을 위한 worktree 구성:

| Worktree | Branch | Path |
|----------|--------|------|
| main | `main` | `artkit/` |
| agent1 | `agent1` | `artkit-agent1/` |
| agent2 | `agent2` | `artkit-agent2/` |
| agent3 | `agent3` | `artkit-agent3/` |

```bash
git worktree list              # 현재 worktree 목록 확인
git worktree add ../artkit-agentN -b agentN  # 새 worktree 추가
git worktree remove ../artkit-agentN         # worktree 제거
```

## Architecture

**Artkit** is a web-based graphics editor (sprites, pixel art, images, audio) built with Next.js 16, React 19, TypeScript 5, and Tailwind CSS 4.

### Domain-Driven Structure

The codebase uses domain-scoped organization where each feature is self-contained:

```
domains/
├── editor/     # Image editor (layers, brushes, transforms, crop, selection)
├── sprite/     # Sprite sheet editor (frame extraction, animation)
├── converter/  # Image format conversion
└── sound/      # Audio editing (trim, format conversion)
```

Each domain has: `hooks/`, `components/`, `contexts/`, `types/`, `utils/`, and a barrel export via `index.ts`.

**shared/** contains cross-domain code:
- `components/layout/` - Layout system (split panes, floating windows)
- `components/icons/` - Shared icon components (SpinnerIcon, CheckIcon, ChevronDownIcon, etc.)
- `components/MenuBar/` - Reusable menu bar with dropdown (MenuDropdown)
- `components/BackgroundRemovalModals.tsx` - ML background removal UI
- `components/` - UI components (Popover, Select, Tooltip, etc.)
- `utils/autosave/` - Storage abstraction (IndexedDB/localStorage)
- `utils/` - Common utilities (generateId, download helpers, cn)
- `contexts/` - Global contexts (Theme, Language, Auth, Sidebar)
- `types/` - Common types (Point, Size, BoundingBox, UnifiedLayer)

### State Management

- **Context API** for app-wide state: Theme, Language, Auth, Sidebar
- **Zustand** for performance-sensitive domain state (editor layout store)

### Layer System

All layers are paint layers (pixel-based). Images are drawn onto layer canvases. Layer data is stored as base64 strings in `paintData`.

Key types in `domains/editor/types/`:
- `UnifiedLayer` - Layer with transform, visibility, opacity, lock state
- `BoundingBox` - For selection and transform operations

### Coordinate System

All coordinate transformations go through `domains/editor/utils/coordinateSystem.ts`:

```
Screen Coords (브라우저 픽셀)
    ↓ screenToCanvas() - DPI 보정
Canvas Display Coords
    ↓ canvasToImage() - zoom/pan 역변환
Image Coords (이미지 논리 좌표)
    ↓ imageToLayer() - layer.position 적용
Layer-Local Coords (레이어 캔버스 내 좌표)
```

**Important**: Always consider `layer.position` when converting between image and layer coordinates (crop, transform, brush operations).

### Editor Constants

UI constants are centralized in `domains/editor/constants/editorConstants.ts`:
- `CHECKERBOARD` - Transparency pattern sizes
- `HANDLE_SIZE` - Transform/crop handle dimensions
- `INTERACTION` - Thresholds (crop min size, guide tolerance)
- `FLOATING_WINDOW` - Window dimensions

Use constants instead of magic numbers:
```typescript
import { CHECKERBOARD, HANDLE_SIZE } from "@/domains/editor/constants";
const size = HANDLE_SIZE.DEFAULT; // not: const size = 10;
```

### Canvas Caching

Canvas operations are cached via `domains/editor/utils/canvasCache.ts`:
- `canvasCache.getCheckerboardPattern()` - Cached transparency patterns
- `canvasCache.getTemporary()` - Reusable temporary canvases
- Reduces GC pressure from frequent canvas creation

### Canvas Rendering

Heavy canvas-based rendering with custom hooks:
- `useCanvasRendering` - Main render loop
- `useMouseHandlers` - Canvas input handling
- `useCoordinateTransform` - Coordinate system utilities as React hook
- `useBrushTool`, `useTransformTool`, `useCropTool`, `useSelectionTool` - Tool implementations
- `useHistory` - Undo/redo with canvas state snapshots

### Storage & Autosave

Multi-tier storage:
1. **IndexedDB** - Primary storage for projects and editor autosave
2. **LocalStorage** - Sprite editor autosave, user preferences
3. **Firebase** - Optional cloud sync

Autosave uses a shared abstraction (`shared/utils/autosave/`):
```typescript
import { createAutosave } from "@/shared/utils";

const autosave = createAutosave<MyData>({
  backend: "indexedDB",  // or "localStorage"
  key: "my-autosave-key",
});
await autosave.save(data);
const loaded = await autosave.load();
```

### AI Background Removal

Client-side ML using RMBG-1.4 via Transformers.js (`utils/backgroundRemoval.ts`). No server required.

### Import Patterns

Always import from domain barrel exports:
```typescript
import { useLayerManagement, useHistory } from "@/domains/editor";
import { SplitView, Panel } from "@/shared";
```

For shared UI components:
```typescript
import {
  MenuDropdown,
  SpinnerIcon,
  CheckIcon,
  BackgroundRemovalModals,
  type MenuItem,
} from "@/shared/components";
```

### Styling

- Tailwind CSS 4 with CSS custom properties for theming
- Theme colors defined in `app/globals.css`
- Use `clsx` and `tailwind-merge` for conditional classes

## Maintenance

- When changing project structure (adding/removing domains, moving directories, changing architectural patterns), update this CLAUDE.md file accordingly.
- Do not add `Co-Authored-By: Claude` to commit messages.
