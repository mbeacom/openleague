import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLeague } from '@/components/providers/LeagueProvider';

/**
 * Keyboard shortcuts for league navigation
 *
 * Shortcuts:
 * - g + d: Go to Dashboard
 * - g + t: Go to Teams
 * - g + s: Go to Schedule
 * - g + r: Go to Roster
 * - g + m: Go to Messages
 * - n + t: New Team
 * - n + g: New Game
 * - n + m: New Message
 * - /: Focus search (if search exists)
 */
export function useLeagueKeyboardShortcuts() {
  const router = useRouter();
  const { currentLeague, isLeagueMode } = useLeague();

  useEffect(() => {
    let keySequence: string[] = [];
    let sequenceTimeout: NodeJS.Timeout;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't trigger when modifier keys are pressed (except for special cases)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      // Handle slash for search focus
      if (key === '/') {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
        if (searchInput) {
          searchInput.focus();
        }
        return;
      }

      // Add key to sequence
      keySequence.push(key);

      // Clear previous timeout
      if (sequenceTimeout) {
        clearTimeout(sequenceTimeout);
      }

      // Set new timeout to clear sequence after 1 second
      sequenceTimeout = setTimeout(() => {
        keySequence = [];
      }, 1000);

      // Check for two-key sequences
      if (keySequence.length === 2) {
        const [first, second] = keySequence;
        const leaguePrefix = isLeagueMode && currentLeague
          ? `/league/${currentLeague.id}`
          : '';

        let path: string | null = null;

        // Navigation shortcuts (g + key)
        if (first === 'g') {
          switch (second) {
            case 'd':
              path = isLeagueMode ? `${leaguePrefix}/dashboard` : '/dashboard';
              break;
            case 't':
              path = isLeagueMode ? `${leaguePrefix}/teams` : '/roster';
              break;
            case 's':
              path = isLeagueMode ? `${leaguePrefix}/schedule` : '/calendar';
              break;
            case 'r':
              path = isLeagueMode ? `${leaguePrefix}/roster` : '/roster';
              break;
            case 'm':
              path = isLeagueMode ? `${leaguePrefix}/messages` : '/events';
              break;
          }
        }

        // New item shortcuts (n + key)
        if (first === 'n' && isLeagueMode && currentLeague) {
          switch (second) {
            case 't':
              path = `${leaguePrefix}/teams/new`;
              break;
            case 'g':
              path = `${leaguePrefix}/schedule/new-game`;
              break;
            case 'm':
              path = `${leaguePrefix}/messages/new`;
              break;
          }
        }

        // Navigate if path was set
        if (path) {
          event.preventDefault();
          router.push(path);
        }

        // Clear sequence after processing
        keySequence = [];
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeout) {
        clearTimeout(sequenceTimeout);
      }
    };
  }, [router, currentLeague, isLeagueMode]);
}
