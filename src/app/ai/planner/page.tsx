'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PlannerRedirect(): JSX.Element {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/planner');
  }, [router]);
  
  return (
    <div className="container mx-auto py-8 text-center">
      <p className="text-gray-300">Redirecting to Planner...</p>
    </div>
  );
}
