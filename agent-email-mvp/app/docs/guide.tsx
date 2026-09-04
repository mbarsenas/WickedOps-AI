import PublicShell from '../components/public-shell';
import CopyCode from '../components/copy-code';
const base='https://governed-agent-email.markbarsenas366.chatgpt.site/api/v1';
const curl=String.raw`curl '${base}/emails' \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: welcome-user-123' \
  -d '{"from":"team@yourdomain.com","to":"customer@example.com","subject":"Welcome","text":"Your account is ready."}'`;
const js=`const response = await fetch('${base}/emails', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + process.env.AGENTMAIL_API_KEY,
    'Content-Type': 'application/json',
    'Idempotency-Key': 'welcome-user-123'
  },
  body: JSON.stringify({from: 'team@yourdomain.com', to: 'customer@example.com',
    subject: 'Welcome', text: 'Your account is ready.'})
});
const result = await response.json();
if (!response.ok) throw new Error(result.error?.message || 'Send failed');
console.log(result);`;
const python=`import json, os, urllib.request
request = urllib.request.Request(
    '${base}/emails',
    data=json.dumps({'from': 'team@yourdomain.com', 'to': 'customer@example.com',
                     'subject': 'Welcome', 'text': 'Your account is ready.'}).encode(),
    headers={'Authorization': 'Bearer ' + os.environ['AGENTMAIL_API_KEY'],
             'Content-Type': 'application/json', 'Idempotency-Key': 'welcome-user-123'},
    method='POST')
with urllib.request.urlopen(request, timeout=30) as response:
    print(json.load(response))`;
const signature=String.raw`import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyWebhook(headers, rawBody, secret) {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signature = headers.get('webhook-signature') || '';
  if (!id || !/^\d+$/.test(timestamp || '')) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  if (!/^v1=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret)
    .update(id + '.' + timestamp + '.' + rawBody).digest();
  const received = Buffer.from(signature.slice(3), 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
// Read rawBody with await request.text() BEFORE JSON parsing.
// Reject invalid signatures. Persist and deduplicate webhook-id before processing.
// Return 2xx only after durable acceptance; queue slow work.`;
export default function Guide(){return <PublicShell><header className="public-hero"><div className="eyebrow">DEVELOPER DOCUMENTATION</div><h1>From first request<br/>to governed email.</h1><p>Use the API from your server. Add agent policies when you need them.</p></header><div className="docs-layout"><nav aria-label="Documentation sections" className="docs-nav">{[['quickstart','Quick start'],['domains','Domains'],['sending','Send email'],['receiving','Receive email'],['webhooks','Webhooks'],['agents','Agent approvals'],['errors','Errors & retries']].map(([id,label])=><a href={'#'+id} key={id}>{label}</a>)}</nav><article className="public-body"><section id="quickstart"><h2>1. Set up a workspace</h2><p>Sign in with email or Google. Create a clearly named workspace, verify a domain, and create an API key. Copy the secret before leaving the page. Keep it in your server environment as AGENTMAIL_API_KEY. Never put it in browser code.</p><p>Each API key belongs to one workspace, regardless of which workspace is selected in the dashboard later.</p></section><section id="domains"><h2>2. Verify a domain you control</h2><ol><li>Add a domain or subdomain under Domains.</li><li>Publish the SenderPermit ownership TXT record shown on its card.</li><li>Click Verify ownership & setup. Existing provider domains are linked only after ownership verification.</li><li>Publish the sending DNS records, then click Verify DNS and Refresh status until verified.</li></ol><p>If your DNS host automatically appends your domain, enter only the relative record name. Keep existing inbox MX records intact. Adding a sending domain does not enable receiving.</p><p>Setup failures keep your record and ownership proof for retry. Adding the same domain again in the same workspace opens its existing setup. Domains assigned to another workspace cannot be claimed here.</p></section><section id="sending"><h2>3. Send an email</h2><CopyCode label="cURL" code={curl}/><CopyCode label="Node.js" code={js}/><CopyCode label="Python" code={python}/><p>Use a unique idempotency key for each logical message; keep the same key and exact payload for retries. Change the example key for a different recipient or message.</p><p>Required fields: from, to, subject, and text. The from address must use your verified domain. The to field accepts one address or an array of 1–50 addresses. reply_to is optional. This API accepts plain text.</p><p>Newly accepted sends return HTTP 202 with id and status; successful replays return HTTP 200 without another send. Provider acceptance does not guarantee inbox delivery. Check Email logs and delivery events.</p></section><section id="receiving"><h2>Receive email</h2><p>Use a dedicated subdomain such as inbox.example.com. Choose Set up receiving in Domains and publish its MX record. This changes routing for that subdomain. Do not replace your main inbox MX records unless you intend to move that inbox.</p><CopyCode label="Read inbound email" code={`curl '${base}/received' -H "Authorization: Bearer $AGENTMAIL_API_KEY"`}/><p>Returns the latest 100 inbound messages for the key’s workspace, including id, from_address, to_addresses, subject, text_body, and created_at. For AI replies, assign an active agent identity on a receiving-enabled domain.</p></section><section id="webhooks"><h2>Signed webhook events</h2><p>Add a public HTTPS endpoint under Webhooks and save its one-time signing secret. Events include email.received, email.sent, email.delivered, email.bounced, and email.failed. They can arrive more than once or out of order.</p><CopyCode label="Node.js signature verification" code={signature}/><p>Use the exact raw body. Reject timestamps outside five minutes and invalid signatures. Store webhook-id in a durable unique column to prevent repeated business actions.</p><p>Failures retry with backoff up to six attempts. Background processing is scheduled every five minutes, with possible delays. Inspect and retry deliveries under Webhooks. Alerts flag failed deliveries and pending deliveries older than 15 minutes.</p></section><section id="agents"><h2>AI agents, policies, and approvals</h2><ol><li>Create an agent with clear instructions.</li><li>Assign its dedicated email identity on a receiving-enabled domain.</li><li>Arrange an AI drafting allowance through support. API email plans do not include AI drafting.</li><li>Send a message to the identity and inspect its conversation.</li><li>Approve & send or Reject the draft in Approvals. Inspect Actions and Audit trail for the result.</li></ol><p>No matching policy requires human approval. Rules run in priority order, lowest number first; the first matching rule wins. Block prevents sending; allow can send automatically. Use an exact recipient for controlled tests. Instructions alone never grant permission.</p><p>Paused agents or identities hold messages. Resume them before Retry processing in Actions. A held-message alert is not necessarily a delivery failure.</p></section><section id="errors"><h2>Errors and safe retries</h2><div className="scroll-table"><table><thead><tr><th>HTTP</th><th>Next step</th></tr></thead><tbody>{[['400','Check required fields and format.'],['401','Use a valid, unrevoked Bearer key.'],['403','Verify domain ownership in the key’s workspace.'],['409','Check changed payload, in-progress send, or expired retry window.'],['429','Check your monthly allowance.'],['500 / 502','Inspect Email logs before retrying with the same key.']].map(([c,t])=><tr key={c}><td>{c}</td><td>{t}</td></tr>)}</tbody></table></div><p>After a timeout, wait at least three minutes and retry the same payload and key. The provider may already have accepted it. The safe retry window is 23 hours; after that, check delivery before creating another message.</p><p>Developer includes 100 API recipients monthly; Starter includes 10,000 for $20/month. Allowances reset on the first day of each month in UTC. <a href="/pricing">See pricing →</a></p><a href="/support">Contact support →</a></section></article></div></PublicShell>;}
