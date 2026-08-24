import assert from "node:assert/strict";

import {
  assertRecordOwnershipChange,
  effectiveRecordScope,
  prepareRecordCreate,
  recordAccessForAgent,
} from "../src/lib/record-access.ts";

const unprotected = {
  key: "public_note",
  fields: [],
  permissions: {},
};

const protectedEntity = {
  key: "document",
  fields: [{ key: "owner_user_id", type: "user_reference" }],
  permissions: {},
  record_access: {
    owner_field: "owner_user_id",
    roles: { admin: "all", operator: "own" },
  },
};

const operator = { userId: "00000000-0000-4000-8000-000000000001", roleKeys: ["operator"] };
const admin = { userId: "00000000-0000-4000-8000-000000000002", roleKeys: ["admin"] };

assert.equal(effectiveRecordScope(unprotected), "all");
assert.equal(effectiveRecordScope(protectedEntity, operator), "own");
assert.equal(effectiveRecordScope(protectedEntity, admin), "all");
assert.equal(effectiveRecordScope(protectedEntity, { ...operator, roleKeys: ["missing"] }), "none");
assert.throws(() => effectiveRecordScope(protectedEntity), /exige una identidad/);

assert.equal(
  effectiveRecordScope(protectedEntity, recordAccessForAgent({
    ownerUserId: operator.userId,
    ownerRoleKey: "operator",
    roleKey: "admin",
  })),
  "own",
  "El agente no puede superar el alcance de su responsable humano",
);

assert.deepEqual(
  prepareRecordCreate(protectedEntity, { title: "Propio" }, operator),
  { title: "Propio", owner_user_id: operator.userId },
);
assert.throws(
  () => prepareRecordCreate(protectedEntity, { owner_user_id: admin.userId }, operator),
  /otra persona/,
);
assert.doesNotThrow(() => assertRecordOwnershipChange(protectedEntity, { owner_user_id: operator.userId }, operator));
assert.throws(
  () => assertRecordOwnershipChange(protectedEntity, { owner_user_id: admin.userId }, operator),
  /fuera de tu propio alcance/,
);

console.log("Record access policy tests passed.");
