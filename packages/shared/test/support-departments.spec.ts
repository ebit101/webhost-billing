import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTicketRequestSchema,
  saveSupportDepartmentSchema,
  updateTicketRequestSchema,
} from '../src/contracts/tickets';

test('department configuration requires explicit visibility, access and an audit reason', () => {
  const input = {
    name: 'Billing',
    enabled: true,
    customerVisible: true,
    restricted: true,
    memberUserIds: ['21600000-0000-4000-8000-000000000004'],
    reason: 'Fictional support restriction',
  };
  assert.equal(saveSupportDepartmentSchema.safeParse(input).success, true);
  for (const changed of [
    { reason: '' },
    { name: '<script>' },
    { memberUserIds: [...input.memberUserIds, ...input.memberUserIds] },
    { revision: 0 },
  ])
    assert.equal(
      saveSupportDepartmentSchema.safeParse({ ...input, ...changed }).success,
      false,
    );
});
test('ticket routing validates IDs and keeps ownership, private message flags and members server controlled', () => {
  const input = {
    submissionKey: '21600000-0000-4000-8000-000000000004',
    departmentId: '21600000-0000-4000-8000-000000000001',
    subject: 'Fictional request',
    body: 'Fictional message',
  };
  assert.equal(createTicketRequestSchema.safeParse(input).success, true);
  for (const extra of [
    { customerId: input.submissionKey },
    { kind: 'SYSTEM' },
    { memberUserIds: [] },
    { departmentId: 'Billing' },
  ])
    assert.equal(
      createTicketRequestSchema.safeParse({ ...input, ...extra }).success,
      false,
    );
  assert.equal(
    updateTicketRequestSchema.safeParse({
      departmentId: input.departmentId,
      routingReason: 'Fictional reassignment',
    }).success,
    true,
  );
  assert.equal(
    updateTicketRequestSchema.safeParse({
      departmentId: input.departmentId,
      routingReason: '<b>reason</b>',
    }).success,
    false,
  );
});
