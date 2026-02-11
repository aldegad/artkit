# Overlay Audit and Refactor Plan (2026-02-11)

## Scope
This audit covers UI overlays in `app/`, `domains/`, and `shared/`:
- Modal/Dialog
- Popover
- Tooltip
- Toast
- Loading and progress overlays related to overlay UX consistency

## Current Primitive Inventory

### 1) Modal/Dialog
- `shared/components/Modal.tsx`
  - Current state: `fixed inset-0`, not rendered with `createPortal`.
  - Missing: `role="dialog"`, `aria-modal`, focus trap, focus restore.
- `shared/components/ExportModal.tsx`
  - Uses `Modal` and has good export progress UI.
- Domain modals using `Modal`:
  - `domains/image/components/ProjectListModal.tsx`
  - `domains/sprite/components/SpriteProjectListModal.tsx`
  - `domains/video/components/VideoProjectListModal.tsx`
  - `domains/sprite/components/SpriteSheetImportModal.tsx`
  - `domains/sprite/components/VideoImportModal.tsx`
  - `shared/components/app/auth/SyncDialog.tsx`

### 2) Popover
- `shared/components/Popover.tsx`
  - Uses `createPortal(document.body)`.
  - Handles escape, outside click, viewport repositioning.
- Used in Select/menu/timeline contexts.

### 3) Tooltip
- `shared/components/Tooltip.tsx`
  - Uses `createPortal(document.body)`.
  - Desktop hover tooltip + mobile long-press popup mode.

### 4) Toast
- `shared/components/SaveToast.tsx`
  - Fixed bottom-right toast, not portal.
- Additional custom save-progress toast-like card:
  - `app/(app)/video/page.tsx` (`fixed bottom-4 right-4` block)

## Non-Standard Overlay Implementations (High Priority)

### Should be unified into Dialog primitive
- `shared/components/BackgroundRemovalModals.tsx`
  - Custom confirm + loading overlays (`fixed inset-0`).
- `domains/image/components/TransformDiscardConfirmModal.tsx`
  - Custom confirm overlay (`fixed inset-0`).
- `domains/sprite/components/FrameBackgroundRemovalModals.tsx`
  - Custom confirm overlay + shared background-removal loading.
- `domains/sprite/components/FrameInterpolationModals.tsx`
  - Custom confirm + progress overlay.
- `domains/video/components/VideoInterpolationModal.tsx`
  - Custom confirm + progress overlay.

### Should be unified into Popover primitive
- `shared/components/SettingsMenu.tsx`
  - Custom absolute dropdown + outside click handling.
- `shared/components/app/auth/UserMenu.tsx`
  - Custom absolute dropdown + outside click handling.
- `domains/image/components/toolbars/EditorActionToolbar.tsx`
  - Rotate menu uses custom absolute dropdown.

### Toast inconsistency
- `shared/components/SaveToast.tsx` vs `app/(app)/video/page.tsx` custom progress toast card.
- No shared queue/provider for success/error/info/progress toasts.

## Consistency and Accessibility Gaps
- Dialog semantics and focus management are inconsistent.
- Escape/backdrop behavior differs by component.
- Progress UI patterns differ:
  - Some have spinner only.
  - Some have spinner + progress bar.
  - Some have spinner + progress text inside toast.
- Native browser dialogs are still used in many places (`window.confirm`, `alert`), causing style and UX inconsistency.

## Recommended Target Architecture

Use 4 global overlay primitives plus 1 local loading pattern:

1. `Dialog` (global, portal)
- Covers modal, confirm, alert, blocking progress dialog.
- Accessibility baseline: `role="dialog"`, `aria-modal`, focus trap, restore focus, escape, optional backdrop close.

2. `Popover` (global, portal)
- Anchored interactive content.
- Replace custom absolute dropdowns (`SettingsMenu`, `UserMenu`, rotate menu).

3. `Tooltip` (global, portal)
- Keep existing primitive, normalize usage where native `title` is used for important UX hints.

4. `Toast` (global, portal + provider)
- Queue-based notifications with variants: `success`, `error`, `info`, `progress`.
- Replace `SaveToast` implementation details and video custom save-progress card.

5. `LoadingMask` (local, non-portal by design)
- Keep for container-scoped loading overlays (page/panel scoped).
- Explicitly not a global overlay.

## Suggested Refactor Phases

### Phase 1: Foundation
- Upgrade `shared/components/Modal.tsx` to portal + accessibility baseline while preserving current public API.
- Add overlay z-index tokens and a simple overlay root convention.

### Phase 2: Dialog Migration
- Migrate custom full-screen overlays to the upgraded dialog primitive:
  - `shared/components/BackgroundRemovalModals.tsx`
  - `domains/image/components/TransformDiscardConfirmModal.tsx`
  - `domains/sprite/components/FrameBackgroundRemovalModals.tsx`
  - `domains/sprite/components/FrameInterpolationModals.tsx`
  - `domains/video/components/VideoInterpolationModal.tsx`

### Phase 3: Popover Migration
- Convert custom dropdown implementations:
  - `shared/components/SettingsMenu.tsx`
  - `shared/components/app/auth/UserMenu.tsx`
  - `domains/image/components/toolbars/EditorActionToolbar.tsx` rotate menu

### Phase 4: Toast Unification
- Introduce `ToastProvider` + `useToast`.
- Consolidate:
  - `shared/components/SaveToast.tsx`
  - `app/(app)/video/page.tsx` custom save-progress card
- Standardize async notification mapping:
  - Long running + blocking -> dialog progress
  - Non-blocking background task -> progress toast

### Phase 5: Browser Dialog Cleanup
- Replace high-frequency `window.confirm`/`alert` flows with dialog/toast patterns.

## Implemented in this branch
- `shared/components/Modal.tsx`
  - Migrated to portal, focus trap, focus restore, body scroll lock, configurable close behavior.
- `shared/components/Popover.tsx`
  - Added side support for `left`/`right`.
- Dialog migration completed for:
  - `shared/components/BackgroundRemovalModals.tsx`
  - `domains/image/components/TransformDiscardConfirmModal.tsx`
  - `domains/sprite/components/FrameBackgroundRemovalModals.tsx`
  - `domains/sprite/components/FrameInterpolationModals.tsx`
  - `domains/video/components/VideoInterpolationModal.tsx`
- Popover migration completed for:
  - `shared/components/SettingsMenu.tsx`
  - `shared/components/app/auth/UserMenu.tsx`
  - `domains/image/components/toolbars/EditorActionToolbar.tsx` (rotate menu)
- Toast unification foundation:
  - Added `shared/components/ToastProvider.tsx` (queue, variants, update/dismiss, progress support, portal viewport).
  - Added `shared/components/ConfirmDialogProvider.tsx` + `confirmDialog(...)`.
  - Wired providers in `app/layout.tsx`.
  - `SaveToast` now delegates to shared toast queue.
  - Removed custom video save-progress toast card and routed it through `SaveToast`.
- `window.confirm` call sites replaced by `confirmDialog(...)` in high-traffic flows:
  - `app/(app)/sprite/page.tsx`
  - `app/(app)/video/page.tsx`
  - `domains/image/hooks/useImageProjectIO.ts`
  - `domains/video/hooks/useVideoProjectLibrary.ts`
- `alert(...)` call sites replaced with explicit shared toast helpers (`showErrorToast` / `showInfoToast`) across `app/` and `domains/`.
- Removed `window.alert` monkey patch from `ToastProvider`; toast behavior no longer depends on global patching.

## Acceptance Checklist
- All global overlays mount via portal.
- No custom `fixed inset-0` dialogs outside shared dialog primitive.
- Dropdown/popover-like elements no longer rely on ad-hoc outside-click hooks.
- Progress display follows one rule set (blocking dialog vs non-blocking progress toast).
- Keyboard and screen reader behavior are consistent across overlays.
