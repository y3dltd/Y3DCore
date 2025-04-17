'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface AutoRefresherProps {
  intervalSeconds?: number;
}

export function AutoRefresher({ intervalSeconds = 30 }: AutoRefresherProps) {
  const router = useRouter();

  useEffect(() => {
    const intervalMilliseconds = intervalSeconds * 1000;
    const intervalId = setInterval(() => {
      console.log(`[AutoRefresher] Refreshing data... (Interval: ${intervalSeconds}s)`);
      router.refresh();
    }, intervalMilliseconds);

    // Clear interval on component unmount
    return () => clearInterval(intervalId);
  }, [router, intervalSeconds]); // Re-run effect if interval changes

  // This component doesn't render anything visible
  return null;
}
