import { Suspense } from 'react';
import DynamicResearch from '@/components/DynamicResearch';
import { ResearchDocsSkeleton } from '@/components/common/Skeleton';

function ResearchFallback() {
  return (
    <section>
      <h1 className="h1" style={{ fontSize: 26 }}>Research a company</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        Search 2,600+ listed Indian equities. Every number links to the page of the exchange PDF it came from.
      </p>
      <div className="skel" style={{ width: '100%', height: 44, borderRadius: 8, marginTop: 14 }} />
      <ResearchDocsSkeleton />
    </section>
  );
}

export default function ResearchPage() {
  return (
    <Suspense fallback={<ResearchFallback />}>
      <DynamicResearch />
    </Suspense>
  );
}
