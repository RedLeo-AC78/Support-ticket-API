import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission } from '../dist/permissions.js';

test('seul SUPER_ADMIN pourra inviter et désactiver les comptes', () => {
  for (const permission of ['users:invite', 'users:manage-status']) {
    assert.equal(hasPermission('SUPER_ADMIN', permission), true);
    for (const role of ['ADMIN', 'AGENT', 'USER']) assert.equal(hasPermission(role, permission), false);
  }
});
test('un agent traite les tickets sans administrer les comptes ; un user reste limité', () => {
  assert.equal(hasPermission('AGENT', 'tickets:update-status'), true);
  assert.equal(hasPermission('AGENT', 'users:list'), false);
  assert.equal(hasPermission('USER', 'tickets:read-all'), false);
  assert.equal(hasPermission('USER', 'tickets:update-status'), false);
  assert.equal(hasPermission('USER', 'tickets:read-own'), true);
});
