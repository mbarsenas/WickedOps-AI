import { sql } from './db';

export type Decision = 'allow' | 'require_approval' | 'block';

export async function evaluatePolicy(agentId: string, actionType: string, payload: Record<string, unknown>) {
  const policies = await sql`
    SELECT id, name, effect, condition_json, priority
    FROM policies
    WHERE agent_id = ${agentId} AND enabled = true AND action_type = ${actionType}
    ORDER BY priority ASC
  `;

  for (const policy of policies) {
    const condition = (policy.condition_json ?? {}) as Record<string, unknown>;
    const matches = Object.entries(condition).every(([key, expected]) => payload[key] === expected);
    if (matches) {
      return {
        decision: policy.effect as Decision,
        policyId: policy.id as string,
        reason: `Matched policy: ${policy.name}`,
      };
    }
  }

  return {
    decision: 'require_approval' as Decision,
    policyId: null,
    reason: 'No matching policy; defaulting to human approval',
  };
}
