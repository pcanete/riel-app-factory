import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { getPool, sql } from "@/lib/db";
import { requireEntity } from "@/lib/spec";
import { recordAccessForAgent } from "@/lib/record-access";
import { authenticateAgentToken } from "@/platform/mcp/store";
import { agentHasPermission } from "@/platform/mcp/access";
import { executeIdempotentMutation } from "@/platform/mcp/mutations";
import { insertRecord, updateRecord, deleteRecord, getRecord, listRecords, countRecords,
  listRecordsForExport, calendarRecords, relationshipOptions } from "@/lib/repository";

assert.equal(process.env.FACTORY_TEST_DATABASE, "1", "Requiere una base descartable y FACTORY_TEST_DATABASE=1");
assert.equal(requireEntity("document").record_access?.owner_field, "owner_user_id", "Generá scripts/security_fixture.py");
const ids = [randomUUID(), randomUUID()];
const agentId = randomUUID();
const token = `factory_mcp_${randomBytes(32).toString("base64url")}`;
const a = { userId: ids[0], roleKeys: ["operator"] };
const b = { userId: ids[1], roleKeys: ["operator"] };
const admin = { userId: ids[0], roleKeys: ["admin"] };
try {
  for (const id of ids) await sql("INSERT INTO app_user (id,email,display_name,role_key,active,auth_subject) VALUES ($1,$2,'Security test','operator',TRUE,$3)", [id, `${id}@test.local`, `test:${id}`]);
  await sql("INSERT INTO app_agent (id,name,token_hash,role_key,owner_user_id,scopes) VALUES ($1,$2,$3,'admin',$4,$5)", [agentId, `test-${agentId}`, createHash("sha256").update(token).digest("hex"), ids[0], ["schema:read","records:read","records:write","records:delete"]]);
  let principal = await authenticateAgentToken(token);
  assert(principal);
  assert.equal(agentHasPermission(principal, "document", "delete"), false, "El agente no supera al responsable");
  assert.equal(agentHasPermission(principal, "document", "update"), true);
  const access = recordAccessForAgent(principal);
  const own = await insertRecord("document", {title:"A", due_date:"2026-09-10"}, undefined, a);
  const other = await insertRecord("document", {title:"B", due_date:"2026-09-11"}, undefined, b);
  assert.equal((await getRecord("document", own, undefined, false, a)).owner_user_id, ids[0]);
  assert.equal(await getRecord("document", other, undefined, false, a), null);
  await assert.rejects(getRecord("document", own), /identidad/);
  assert.equal(await countRecords("document", a), 1);
  for (const rows of [await listRecords("document", {access:a}), await listRecordsForExport("document", 100, a), await calendarRecords("document", "due_date", "2026-09-01", "2026-10-01", "UTC", a)]) {
    assert.deepEqual(rows.map(r=>r.id), [own]);
  }
  assert.deepEqual((await relationshipOptions(requireEntity("document"), a)).parent_document.map(r=>r.id), [own]);
  await assert.rejects(insertRecord("document", {title:"Wrong owner",owner_user_id:ids[1]}, undefined,a), /otra persona/);
  await assert.rejects(insertRecord("document", {title:"Wrong relation",parent_document_id:other}, undefined,a), /alcance/);
  await assert.rejects(updateRecord("document", own, {owner_user_id:ids[1]}, undefined,a), /alcance/);
  await assert.rejects(updateRecord("document", other, {title:"Denied"}, undefined,a), /alcance/);
  await assert.rejects(deleteRecord("document", other, undefined,a), /alcance/);
  await updateRecord("document", own, {title:"Updated"}, undefined,a);
  assert.equal((await getRecord("document",own,undefined,false,a)).title,"Updated");

  let executions = 0;
  const mutation = (key, who=principal, inputTitle="Secret A") => executeIdempotentMutation({
    agent:who, entityKey:"document", toolName:"create_record", idempotencyKey:key,
    request:{values:{title:inputTitle}}, execute:async(client)=>{
      executions++;
      const id = await insertRecord("document",{title:inputTitle},client,recordAccessForAgent(who));
      return {recordId:id,result:{record:await getRecord("document",id,client,false,recordAccessForAgent(who))}};
    },
  });
  const created = await mutation("security-replay-01");
  assert(created.record);
  // Simulate an existing pre-upgrade cache containing business data.
  await sql("UPDATE app_agent_mutation SET result=$2::jsonb WHERE agent_id=$1",[agentId,JSON.stringify(created)]);
  await sql("UPDATE app_agent SET owner_user_id=$2 WHERE id=$1",[agentId,ids[1]]);
  principal = await authenticateAgentToken(token);
  assert.equal(await getRecord("document",created.record.id,undefined,false,recordAccessForAgent(principal)),null);
  const replay = await mutation("security-replay-01",principal);
  assert.deepEqual(replay,{entityKey:"document",already_applied:true,idempotent_replay:true});
  assert.equal(executions,1);
  await assert.rejects(mutation("security-replay-01",principal,"Different request"),/otra mutación/);
  const concurrent = await Promise.all([mutation("security-concurrent-01"),mutation("security-concurrent-01")]);
  assert.equal(concurrent.filter(r=>r.idempotent_replay).length,1);
  assert.equal(executions,2);
  await sql("UPDATE app_user SET active=FALSE WHERE id=$1",[ids[1]]);
  assert.equal(await authenticateAgentToken(token),null);
  assert.equal((await getRecord("document",other,undefined,false,admin)).title,"B");
  console.log("Security DB passed: ownership, lists/export/calendar, relationships, human ceiling, inactive owner, legacy replay and concurrent retries.");
} finally {
  await sql("DELETE FROM app_agent_mutation WHERE agent_id=$1",[agentId]);
  await sql("DELETE FROM document WHERE owner_user_id=ANY($1::uuid[])",[ids]);
  await sql("DELETE FROM app_agent WHERE id=$1",[agentId]);
  await sql("DELETE FROM app_user WHERE id=ANY($1::uuid[])",[ids]);
  await getPool().end();
}
