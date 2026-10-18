export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: "grid", gap: "var(--space-4)", paddingTop: "var(--space-2)" }}>
      <span className="visually-hidden">Loading…</span>
      <div style={{ height: "0.75rem", width: "6rem", background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)" }} />
      <div style={{ height: "2rem", width: "60%", background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)" }} />
      <div style={{ height: "1px", background: "var(--rule-strong)", margin: "var(--space-2) 0" }} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "3.75rem 1fr", gap: "var(--space-4)", padding: "var(--space-3) 0", borderBottom: "1px solid var(--rule)" }}>
          <div style={{ aspectRatio: "3/4", background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)" }} />
          <div style={{ display: "grid", gap: "var(--space-2)", alignContent: "start" }}>
            <div style={{ height: "0.7rem", width: "35%", background: "var(--surface-sunken)", borderRadius: 2 }} />
            <div style={{ height: "1rem", width: "70%", background: "var(--surface-sunken)", borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
