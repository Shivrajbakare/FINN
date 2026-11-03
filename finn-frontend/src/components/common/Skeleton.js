export function Skeleton({ w = '100%', h = 16, r = 4, style, className = '' }) {
  return (
    <div
      className={`skel ${className}`}
      style={{
        width: w,
        height: h,
        borderRadius: r,
        ...style,
      }}
    />
  );
}

export function HomeSkeleton() {
  return (
    <div>
      <section>
        <Skeleton w="55%" h={14} style={{ marginBottom: 8 }} />
        <Skeleton w="82%" h={32} style={{ margin: '6px 0 6px' }} />
        <Skeleton w="48%" h={15} style={{ marginBottom: 18 }} />
        <Skeleton w="100%" h={76} r={8} style={{ marginBottom: 10 }} />
        <div className="comb-foot" style={{ marginTop: 8 }}>
          <Skeleton w="38%" h={14} />
          <Skeleton w="38%" h={14} />
        </div>
      </section>

      <section style={{ marginTop: 26 }}>
        <div className="sec-head">
          <Skeleton w="32%" h={20} />
          <Skeleton w="18%" h={14} />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="attn" style={{ opacity: 0.9 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <Skeleton w={75} h={16} />
                <Skeleton w={110} h={13} />
              </div>
              <Skeleton w="70%" h={13} />
            </div>
            <Skeleton w={72} h={22} r={5} />
          </div>
        ))}
      </section>

      <section style={{ marginTop: 26 }}>
        <div className="sec-head">
          <Skeleton w="35%" h={20} />
          <Skeleton w="22%" h={14} />
        </div>
        <Skeleton w="100%" h={140} r={8} />
      </section>

      <section style={{ marginTop: 26 }}>
        <div className="sec-head">
          <Skeleton w="38%" h={20} />
          <Skeleton w="24%" h={14} />
        </div>
        <div className="ledger">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="lrow">
              <div>
                <Skeleton w={80} h={16} style={{ marginBottom: 4 }} />
                <Skeleton w={130} h={12} />
              </div>
              <Skeleton w={64} h={22} r={3} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <Skeleton w={65} h={16} style={{ marginBottom: 4 }} />
                <Skeleton w={45} h={12} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 26 }}>
        <Skeleton w="100%" h={64} r={8} />
      </section>
    </div>
  );
}

export function AlertDigestSkeleton() {
  return (
    <div style={{ marginTop: 12 }}>
      {[1, 2, 3].map((i) => (
        <article key={i} className="card" style={{ marginTop: i === 1 ? 0 : 12, opacity: 0.9 }}>
          <div className="card-top">
            <Skeleton w={70} h={16} />
            <Skeleton w={120} h={14} />
            <Skeleton w={60} h={20} r={5} />
          </div>
          <div className="card-top" style={{ marginTop: 8 }}>
            <Skeleton w={95} h={12} />
            <Skeleton w={75} h={20} r={5} />
            <Skeleton w={60} h={20} r={5} />
          </div>
          <Skeleton w="92%" h={18} style={{ margin: '12px 0 6px' }} />
          <Skeleton w="65%" h={18} style={{ marginBottom: 10 }} />
          <Skeleton w="100%" h={14} style={{ marginBottom: 5 }} />
          <Skeleton w="60%" h={14} style={{ marginBottom: 14 }} />
          <div className="figs num">
            <div style={{ padding: '10px 12px' }}>
              <Skeleton w={50} h={12} style={{ marginBottom: 4 }} />
              <Skeleton w={75} h={20} />
            </div>
            <div style={{ padding: '10px 12px' }}>
              <Skeleton w={50} h={12} style={{ marginBottom: 4 }} />
              <Skeleton w={75} h={20} />
            </div>
          </div>
          <div className="card-foot" style={{ marginTop: 14 }}>
            <Skeleton w={120} h={16} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function AlertAnomaliesSkeleton() {
  return (
    <div style={{ marginTop: 16 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="card" style={{ marginTop: i === 1 ? 0 : 12, opacity: 0.9 }}>
          <div className="card-top">
            <Skeleton w={80} h={16} />
            <Skeleton w={120} h={14} />
            <Skeleton w={60} h={20} r={5} />
            <Skeleton w={55} h={18} style={{ marginLeft: 'auto' }} />
          </div>
          <Skeleton w="85%" h={14} style={{ margin: '10px 0 8px' }} />
          <Skeleton w="100%" h={8} r={4} style={{ marginTop: 12 }} />
          <Skeleton w="60%" h={12} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function ResearchDocsSkeleton() {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="seg" role="tablist">
        {['Financials', 'Guidance', 'Overview', 'Risks'].map((name) => (
          <button key={name} role="tab" disabled style={{ opacity: 0.6 }}>
            {name}
          </button>
        ))}
      </div>
      <Skeleton w="65%" h={14} style={{ margin: '14px 0 20px' }} />
      <Skeleton w="45%" h={18} style={{ marginBottom: 14 }} />
      {[1, 2, 3].map((i) => (
        <div key={i} className="doc" style={{ opacity: 0.85 }}>
          <div className="card-top">
            <Skeleton w={130} h={21} r={5} />
            <Skeleton w={65} h={21} r={5} />
            <Skeleton w={75} h={13} style={{ marginLeft: 'auto' }} />
          </div>
          <Skeleton w="88%" h={18} style={{ margin: '10px 0 6px' }} />
          <Skeleton w="40%" h={13} style={{ marginBottom: 10 }} />
          <div className="acts">
            <Skeleton w={80} h={32} r={8} />
            <Skeleton w={85} h={32} r={8} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResearchDossierSkeleton() {
  return (
    <div className="dossier" style={{ marginTop: 14, opacity: 0.9 }}>
      <Skeleton w="35%" h={13} style={{ marginBottom: 8, background: 'rgba(255,255,255,0.15)' }} />
      <Skeleton w="75%" h={22} style={{ marginBottom: 12, background: 'rgba(255,255,255,0.2)' }} />
      <Skeleton w="100%" h={14} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.12)' }} />
      <Skeleton w="85%" h={14} style={{ marginBottom: 14, background: 'rgba(255,255,255,0.12)' }} />
      <div className="dfigs num" style={{ borderBlockColor: 'rgba(255,255,255,0.1)' }}>
        <div>
          <Skeleton w={90} h={24} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.2)' }} />
          <Skeleton w={70} h={12} style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>
        <div>
          <Skeleton w={90} h={24} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.2)' }} />
          <Skeleton w={70} h={12} style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>
      </div>
      <Skeleton w="95%" h={14} style={{ marginTop: 12, background: 'rgba(255,255,255,0.12)' }} />
    </div>
  );
}
