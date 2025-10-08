import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts, useFocusNavigation, useDialogKeyboard } from '@/lib/hooks/useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  it('should call handler when keyboard shortcut is pressed', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        shortcuts: [
          {
            key: 'n',
            ctrl: true,
            handler,
            description: 'Test shortcut',
          },
        ],
        enabled: true,
      })
    );

    // Simulate Ctrl+N keypress
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not call handler when shortcut is disabled', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        shortcuts: [
          {
            key: 'n',
            ctrl: true,
            handler,
            enabled: false,
          },
        ],
        enabled: true,
      })
    );

    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useFocusNavigation', () => {
  it('should navigate to next item on ArrowDown', () => {
    const onSelect = vi.fn();
    renderHook(() =>
      useFocusNavigation({
        itemCount: 5,
        onSelect,
        enabled: true,
      })
    );

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('should loop back to first item when at end', () => {
    const onSelect = vi.fn();
    renderHook(() =>
      useFocusNavigation({
        itemCount: 3,
        onSelect,
        enabled: true,
        loop: true,
      })
    );

    // Navigate through all items: -1 -> 0 -> 1 -> 2 -> 0 (loop)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })); // 0
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })); // 1
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })); // 2
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })); // 0 (loop)
    });

    // Should loop back to 0
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });
});

describe('useDialogKeyboard', () => {
  it('should call onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    renderHook(() =>
      useDialogKeyboard({
        isOpen: true,
        onClose,
        closeOnEscape: true,
      })
    );

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onConfirm when Enter is pressed', () => {
    const onConfirm = vi.fn();
    renderHook(() =>
      useDialogKeyboard({
        isOpen: true,
        onClose: vi.fn(),
        onConfirm,
        confirmOnEnter: true,
      })
    );

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
