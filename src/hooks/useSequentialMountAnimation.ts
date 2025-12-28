import { useEffect, useState } from 'react';

/**
 * Hook for sequential fade-in animations
 * Staggers children animations by 80ms
 */
export function useSequentialMountAnimation(delay: number = 0) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return isVisible;
}

/**
 * Hook to apply sequential animation to multiple items
 */
export function useSequentialItems<T>(items: T[], staggerMs: number = 80) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount < items.length) {
      const timer = setTimeout(() => {
        setVisibleCount((prev) => prev + 1);
      }, staggerMs);

      return () => clearTimeout(timer);
    }
  }, [visibleCount, items.length, staggerMs]);

  return items.map((item, index) => ({
    item,
    isVisible: index < visibleCount,
    delay: index * staggerMs,
  }));
}

