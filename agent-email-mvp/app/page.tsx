import { sql } from '../lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [agents, approvals, audit] = await Promise.all([
    sql`SELECT a.id, a.name, a.status, ei.address FROM agents a LEFT JOIN email_identities ei ON ei.agent_id=a.id ORDER BY a.created_at DESC LIMIT 20`,
    sql`SELECT ap.id, ap.requested_at, pa.action_type, pa.payload, pa.rationale FROM approvals ap JOIN proposed_actions pa ON pa.id=ap.proposed_action_id WHERE ap.status='pending' ORDER BY ap.requested_at DESC LIMIT 20`,
    sql`SELECT event_type, actor_type, data, created_at FROM audit_events ORDER BY created_at DESC LIMIT 30`,
  ]);

  return (
    <main style={{ fontFamily: 'Arial, sans-serif', maxWidth: 1180, margin: '40px auto', padding: '0 20px' }}>
      <h1>Governed Agent Email</h1>
      <p>AI Agent → Email Identity → Policy → Send/Receive → Conversation → Actions → Audit</p>

      <section>
        <h2>Agents</h2>
        <table width="100%" cellPadding={10} style={{ borderCollapse: 'collapse' }}>
          <thead><tr><th align="left">Agent</th><th align="left">Email identity</th><th align="left">Status</th></tr></thead>
          <tbody>{agents.map((a: any) => <tr key={a.id}><td>{a.name}</td><td>{a.address ?? 'Not assigned'}</td><td>{a.status}</td></tr>)}</tbody>
        </table>
      </section>

      <section style={{ marginTop: 36 }}>
        <h2>Pending approvals</h2>
        {approvals.length === 0 ? <p>No pending approvals.</p> : approvals.map((a: any) => (
          <article key={a.id} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <strong>{a.action_type}</strong>
            <p>{a.rationale}</p>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(a.payload, null, 2)}</pre>
            <form action={`/api/approvals/${a.id}/approve`} method="post"><button type="submit">Approve & execute</button></form>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 36 }}>
        <h2>Audit trail</h2>
        {audit.map((e: any, i: number) => <div key={i} style={{ borderBottom: '1px solid #eee', padding: '10px 0' }}><strong>{e.event_type}</strong> · {e.actor_type}<br/><small>{new Date(e.created_at).toLocaleString()}</small></div>)}
      </section>
    </main>
  );
}
