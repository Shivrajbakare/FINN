import { Suspense } from 'react';
import DynamicResearch from '@/components/DynamicResearch';

export default function ResearchPage() {
  return (
    <Suspense fallback={null}>
      <DynamicResearch />
    </Suspense>
  );
}
