import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, type Rule } from '../lib/policy';
const rule=(effect:Rule['effect'],priority=100,condition_json:Record<string,unknown>={}):Rule=>({id:String(priority),name:effect,effect,priority,condition_json});
test('unmatched email requires human approval',()=>{assert.equal(decide([],{channel:'email'}).decision,'require_approval');});
test('lower priority number takes precedence over allow',()=>{assert.equal(decide([rule('allow',100),rule('block',1)],{}).decision,'block');});
test('recipient allow cannot authorize another recipient',()=>{const rules=[rule('allow',100,{to:'test@example.com',channel:'email'})];assert.equal(decide(rules,{to:'victim@example.com',channel:'email'}).decision,'require_approval');assert.equal(decide(rules,{to:'test@example.com',channel:'email'}).decision,'allow');});
test('all conditions must match and missing fields fail closed',()=>{assert.equal(decide([rule('allow',100,{channel:'email',to:'a@b.com'})],{channel:'email'}).decision,'require_approval');});
