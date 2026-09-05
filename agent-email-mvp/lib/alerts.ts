import {db} from './db';
import {syncDelivery,deliverySnapshot} from './transport/sync';
export async function syncAlerts(org:string){
 await syncDelivery(org);
 const snapshot=await deliverySnapshot(org);
 const sql=db();
 const rows=await sql`SELECT 'job/'||provider_message_id AS source_key,'email' AS category,'Inbound email needs attention' AS title,'Open Actions to review and retry held or failed processing.' AS detail FROM email_jobs WHERE organization_id=${org} AND (status IN('failed','held') OR (status='processing' AND lease_until<now()))
 UNION ALL SELECT 'send/'||id::text,'email','Email sending needs attention','Open Email logs to inspect this message. Check delivery before retrying.' FROM email_api_events WHERE organization_id=${org} AND (status IN('failed','bounced') OR (status='sending' AND lease_until<now()))
 UNION ALL SELECT 'action/'||p.id::text,'email','Agent reply needs attention','Open Actions to review the failed or interrupted send.' FROM proposed_actions p JOIN agents a ON a.id=p.agent_id LEFT JOIN action_executions e ON e.action_id=p.id WHERE a.organization_id=${org} AND (p.status='failed' OR (e.state='sending' AND e.lease_until<now()))
 UNION ALL SELECT 'webhook/'||id::text,'webhook','Webhook delivery needs attention','Open Webhooks to inspect delivery attempts and retry.' FROM webhook_deliveries WHERE organization_id=${org} AND (status='failed' OR (status='pending' AND created_at<now()-interval '15 minutes'))
 UNION ALL SELECT 'billing/subscription','billing','Subscription needs attention','Open Usage & billing to update your payment method or subscription.' FROM organizations WHERE id=${org} AND subscription_status IN('past_due','unpaid','incomplete','incomplete_expired','paused')`;
 for(const [source,value] of Object.entries(snapshot.items||{})){const item=value as any;if(item.attention&&!rows.some(r=>r.source_key===source))rows.push({source_key:source,category:'email',title:'SenderPermit delivery needs attention',detail:item.detail});}
 if(snapshot.unavailable)rows.push({source_key:'aws/status',category:'email',title:'Mail status checks are unavailable',detail:'Latest SenderPermit delivery status could not be retrieved. Existing results have been kept. Refresh to retry; do not resend solely because this check failed.'});
 const reception=(await sql`SELECT value FROM app_settings WHERE key=${'aws_inbound/'+org}`)[0]?.value;
 if(reception?.ok===false)rows.push({source_key:'aws/inbound',category:'email',title:'Incoming mail processing needs attention',detail:'Incoming mail could not be fully processed. Messages remain stored for retry; check Actions for held or failed work.'});
 const keys=rows.map(r=>r.source_key);
 await sql.transaction([sql`UPDATE workspace_alerts SET status='resolved',updated_at=now() WHERE organization_id=${org} AND status='open' AND source_key NOT LIKE 'billing/event/%' AND NOT(source_key=ANY(${keys}::text[]))`,...rows.map(r=>sql`INSERT INTO workspace_alerts(organization_id,source_key,category,title,detail) VALUES(${org},${r.source_key},${r.category},${r.title},${r.detail}) ON CONFLICT(organization_id,source_key) DO UPDATE SET status='open',title=EXCLUDED.title,detail=EXCLUDED.detail,updated_at=now()`)]);
 return sql`SELECT * FROM workspace_alerts WHERE organization_id=${org} ORDER BY (status='open') DESC,created_at DESC LIMIT 100`;
}
