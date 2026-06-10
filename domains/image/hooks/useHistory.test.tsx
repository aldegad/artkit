// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHistory, type HistoryAdapter } from "./useHistory";

interface EditorState {
  value: string;
}

function createAdapterHarness(initial: string) {
  const holder = { state: { value: initial } as EditorState };
  const adapter: HistoryAdapter<EditorState> = {
    captureState: () => ({ ...holder.state }),
    applyState: (state) => {
      holder.state = { ...state };
    },
  };
  return { holder, adapterRef: { current: adapter } };
}

describe("useHistory (adapter-based undo/redo)", () => {
  it("undoes and redoes editor state", () => {
    const { holder, adapterRef } = createAdapterHarness("A");
    const { result } = renderHook(() =>
      useHistory<EditorState>({ historyAdapterRef: adapterRef })
    );

    expect(result.current.canUndo()).toBe(false);
    expect(result.current.canRedo()).toBe(false);

    // saveToHistory is called BEFORE a mutation
    act(() => {
      result.current.saveToHistory();
    });
    holder.state = { value: "B" };

    expect(result.current.canUndo()).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(holder.state.value).toBe("A");
    expect(result.current.canUndo()).toBe(false);
    expect(result.current.canRedo()).toBe(true);

    act(() => {
      result.current.redo();
    });
    expect(holder.state.value).toBe("B");
    expect(result.current.canUndo()).toBe(true);
    expect(result.current.canRedo()).toBe(false);
  });

  it("clears the redo stack on a new mutation", () => {
    const { holder, adapterRef } = createAdapterHarness("A");
    const { result } = renderHook(() =>
      useHistory<EditorState>({ historyAdapterRef: adapterRef })
    );

    act(() => {
      result.current.saveToHistory();
    });
    holder.state = { value: "B" };
    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo()).toBe(true);

    // New mutation after undo invalidates redo history
    act(() => {
      result.current.saveToHistory();
    });
    holder.state = { value: "C" };
    expect(result.current.canRedo()).toBe(false);

    act(() => {
      result.current.undo();
    });
    expect(holder.state.value).toBe("A");
  });

  it("caps history depth at maxHistory", () => {
    const { holder, adapterRef } = createAdapterHarness("v0");
    const { result } = renderHook(() =>
      useHistory<EditorState>({ historyAdapterRef: adapterRef, maxHistory: 3 })
    );

    for (let i = 1; i <= 5; i += 1) {
      act(() => {
        result.current.saveToHistory();
      });
      holder.state = { value: `v${i}` };
    }

    // Only the last 3 snapshots survive: v2, v3, v4
    for (const expected of ["v4", "v3", "v2"]) {
      act(() => {
        result.current.undo();
      });
      expect(holder.state.value).toBe(expected);
    }
    expect(result.current.canUndo()).toBe(false);
  });

  it("clearHistory resets both stacks", () => {
    const { holder, adapterRef } = createAdapterHarness("A");
    const { result } = renderHook(() =>
      useHistory<EditorState>({ historyAdapterRef: adapterRef })
    );

    act(() => {
      result.current.saveToHistory();
    });
    holder.state = { value: "B" };
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.canUndo()).toBe(false);
    expect(result.current.canRedo()).toBe(false);
  });
});
