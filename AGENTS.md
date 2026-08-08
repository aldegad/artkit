# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Language

- Always respond in Korean (한국어로 답변할 것).

## Commands

```bash
npm run dev      # Start dev server on http://localhost:3005
npm run build    # Build for production (static export to /out)
npm run lint     # Run ESLint
npm run deploy   # Build and deploy to Firebase Hosting
npm test         # Run the vitest suite (emulator-backed rules tests excluded)
npm run test:rules   # Firebase security rules tests (spins up firestore/storage emulators, needs a JRE)
npm run rules:build  # Re-render the allowed-uid block in firestore.rules / storage.rules
```

## Git Commit Convention

- Use Conventional Commits for all future commits.
- Required format: `<type>: <subject>`
- Preferred `type` values:
  - `feat`: user-visible feature
  - `fix`: bug fix
  - `refactor`: structural change without behavior change
  - `chore`: maintenance/internal task
  - `docs`: documentation update
- Avoid commits without a prefix.

## Git Worktrees

병렬 작업을 위한 worktree 구성:

| Worktree | Branch | Path |
|----------|--------|------|
| main | `main` | `artkit/` |
| agent1 | `agent1` | `artkit-agent1/` |
| agent2 | `agent2` | `artkit-agent2/` |
| agent3 | `agent3` | `artkit-agent3/` |
| agent4 | `agent4` | `artkit-agent4/` |
| agent5 | `agent5` | `artkit-agent5/` |

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
├── image/      # Image editor (layers, brushes, transforms, crop, selection)
├── sprite/     # Sprite sheet editor (frame extraction, animation)
├── converter/  # Image format conversion
├── sound/      # Audio editing (trim, format conversion)
├── video/      # Video editor (timeline, multi-track, masking)
└── icons/      # Icon showcase (browse, search, copy SVG, download)
```

Each domain has: `hooks/`, `components/`, `contexts/`, `types/`, `utils/`, and a barrel export via `index.ts`.

**shared/** contains cross-domain code:
- `components/layout/` - Layout system (split panes, floating windows)
- `components/icons/` - Shared icon library (~90 icons, categorized by function)
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

Key types in `domains/image/types/`:
- `UnifiedLayer` - Layer with transform, visibility, opacity, lock state
- `BoundingBox` - For selection and transform operations

### Coordinate System

All coordinate transformations go through `domains/image/utils/coordinateSystem.ts`:

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

UI constants are centralized in `domains/image/constants/editorConstants.ts`:
- `CHECKERBOARD` - Transparency pattern sizes
- `HANDLE_SIZE` - Transform/crop handle dimensions
- `INTERACTION` - Thresholds (crop min size, guide tolerance)
- `FLOATING_WINDOW` - Window dimensions

Use constants instead of magic numbers:
```typescript
import { CHECKERBOARD, HANDLE_SIZE } from "@/domains/image/constants";
const size = HANDLE_SIZE.DEFAULT; // not: const size = 10;
```

### Canvas Caching

Canvas operations are cached via `domains/image/utils/canvasCache.ts`:
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

### Video Editor

Premiere-style video editor with timeline and masking (`domains/video/`):

**Architecture:**
- `VideoStateContext` - Playback state, project management
- `TimelineContext` - Tracks, clips, zoom/scroll
- `MaskContext` - Mask editing, keyframes, brush settings

**Key Features:**
- Multi-track timeline with drag/trim clips
- Video/image import via drag-and-drop
- Layer compositing (tracks stacked by zIndex)
- Masking system (draw on clips to reveal layers below)
- Soft brush with radial gradients for mask painting
- Keyframe-based mask interpolation

**Coordinate System:**
```
Time (seconds) ←→ Pixel position
  timeToPixel(time) = (time - scrollX) * zoom
  pixelToTime(pixel) = scrollX + pixel / zoom
```

**Mask Storage:**
- Keyframed mode: Store only keyframes, interpolate at runtime
- Masks stored as base64 PNG (grayscale alpha channel)
- White = visible, Black = transparent (reveals below)

### Agent Collaboration Bridge (video)

An agent can inject a video project (clips + BGM/SFX on separate audio tracks) into the local editor and read back what the user edited:

```bash
npm run video:open              # launch the collaboration Chrome window (keep the terminal open)
npm run video:push -- <dir>     # inject a bundle; it appears in /video immediately
npm run video:pull -- <out>     # dump the current edit state back to a bundle (or <out>.json)
```

Bundle format, the browser-profile constraint behind the dedicated window, and operational gotchas: `docs/agent-video-bundle.md`. Format SSoT is `domains/video/utils/videoBundle.ts`; the in-app surface is `domains/video/hooks/useAgentBridge.ts` (dev-only unless `NEXT_PUBLIC_ARTKIT_AGENT_BRIDGE=1`).

### Cloud Access Lock

Firestore/Storage access is restricted to an explicit Firebase uid allowlist, because any signed-in Google account used to be able to write to its own space and that write is the cloud bill. The allowlist has exactly one definition site — `firebase/allowed-uids.json` — and `scripts/generate-firebase-rules.mjs` renders it into the marked block of both `firestore.rules` and `storage.rules` (rules files cannot import each other). Hand-editing either block fails the drift test in `npm test`. An empty list denies everyone, which is the safe default. Rationale, uid lookup, and the deploy command: `docs/firebase-access-lock.md`.

### AI Background Removal

Client-side ML using RMBG-1.4 via Transformers.js (`utils/backgroundRemoval.ts`). No server required.

### Import Patterns

Always import from domain barrel exports:
```typescript
import { useLayerManagement, useHistory } from "@/domains/image";
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

- When changing project structure (adding/removing domains, moving directories, changing architectural patterns), update this AGENTS.md file accordingly.
- Do not add `Co-Authored-By: Codex` to commit messages.
