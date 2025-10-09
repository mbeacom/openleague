'use client';

import { useEffect } from 'react';
import { marketingEvents } from '@/lib/analytics/tracking';

/**
 * Hook to track scroll depth for engagement analytics
 */
export function useScrollTracking() {
  useEffect(() => {
    let ticking = false;
    const scrollMilestones = [25, 50, 75, 90];
    const trackedMilestones = new Set<number>();

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;

          // Guard against division by zero when page isn't scrollable
          if (docHeight <= 0) {
            ticking = false;
            return;
          }

          const scrollPercent = Math.round((scrollTop / docHeight) * 100);

          // Track milestone percentages
          scrollMilestones.forEach(milestone => {
            if (scrollPercent >= milestone && !trackedMilestones.has(milestone)) {
              trackedMilestones.add(milestone);
              marketingEvents.pageScroll(milestone);
            }
          });

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);
}