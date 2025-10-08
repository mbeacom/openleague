import { useEffect, useCallback, useRef } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: (event: KeyboardEvent) => void;
  description?: string;
  enabled?: boolean;
}

export interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
  preventDefault?: boolean;
  target?: HTMLElement | null;
}

/**
 * Custom hook for handling keyboard shortcuts and navigation
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts({
 *   shortcuts: [
 *     {
 *       key: 'n',
 *       ctrl: true,
 *       handler: () => openNewDialog(),
 *       description: 'Create new item'
 *     },
 *     {
 *       key: 'Escape',
 *       handler: () => closeDialog(),
 *       description: 'Close dialog'
 *     }
 *   ],
 *   enabled: isDialogOpen,
 * });
 * ```
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
  preventDefault = true,
  target,
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);

  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const activeShortcuts = shortcutsRef.current.filter(
        (shortcut) => shortcut.enabled !== false
      );

      for (const shortcut of activeShortcuts) {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatches = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatches = shortcut.alt ? event.altKey : !event.altKey;

        if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
          if (preventDefault) {
            event.preventDefault();
          }
          shortcut.handler(event);
          break;
        }
      }
    },
    [enabled, preventDefault]
  );

  useEffect(() => {
    const targetElement = target || window;

    if (enabled) {
      targetElement.addEventListener("keydown", handleKeyDown as EventListener);
    }

    return () => {
      targetElement.removeEventListener("keydown", handleKeyDown as EventListener);
    };
  }, [enabled, handleKeyDown, target]);
}

/**
 * Hook for managing focus with arrow keys
 */
export interface UseFocusNavigationOptions {
  itemCount: number;
  onSelect?: (index: number) => void;
  enabled?: boolean;
  orientation?: 'vertical' | 'horizontal';
  loop?: boolean;
}

export function useFocusNavigation({
  itemCount,
  onSelect,
  enabled = true,
  orientation = 'vertical',
  loop = true,
}: UseFocusNavigationOptions) {
  const currentIndexRef = useRef(-1);

  const navigate = useCallback(
    (direction: 'next' | 'prev') => {
      if (!enabled || itemCount === 0) return;

      let newIndex = currentIndexRef.current;

      if (direction === 'next') {
        newIndex = currentIndexRef.current + 1;
        if (newIndex >= itemCount) {
          newIndex = loop ? 0 : itemCount - 1;
        }
      } else {
        newIndex = currentIndexRef.current - 1;
        if (newIndex < 0) {
          newIndex = loop ? itemCount - 1 : 0;
        }
      }

      currentIndexRef.current = newIndex;
      return newIndex;
    },
    [enabled, itemCount, loop]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const isVertical = orientation === 'vertical';
      const nextKey = isVertical ? 'ArrowDown' : 'ArrowRight';
      const prevKey = isVertical ? 'ArrowUp' : 'ArrowLeft';

      if (event.key === nextKey) {
        event.preventDefault();
        const newIndex = navigate('next');
        if (newIndex !== undefined && onSelect) {
          onSelect(newIndex);
        }
      } else if (event.key === prevKey) {
        event.preventDefault();
        const newIndex = navigate('prev');
        if (newIndex !== undefined && onSelect) {
          onSelect(newIndex);
        }
      }
    },
    [enabled, orientation, navigate, onSelect]
  );

  useEffect(() => {
    if (enabled) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, handleKeyDown]);

  return {
    currentIndex: currentIndexRef.current,
    setCurrentIndex: (index: number) => {
      currentIndexRef.current = index;
    },
    resetIndex: () => {
      currentIndexRef.current = -1;
    },
  };
}

/**
 * Hook for managing dialog keyboard interactions
 */
export interface UseDialogKeyboardOptions {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  closeOnEscape?: boolean;
  confirmOnEnter?: boolean;
}

export function useDialogKeyboard({
  isOpen,
  onClose,
  onConfirm,
  closeOnEscape = true,
  confirmOnEnter = false,
}: UseDialogKeyboardOptions) {
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'Escape',
        handler: onClose,
        description: 'Close dialog',
        enabled: closeOnEscape && isOpen,
      },
      {
        key: 'Enter',
        handler: () => onConfirm?.(),
        description: 'Confirm action',
        enabled: confirmOnEnter && isOpen && !!onConfirm,
      },
    ],
    enabled: isOpen,
    preventDefault: true,
  });
}
