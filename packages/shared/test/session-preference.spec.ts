import assert from 'node:assert/strict';
import { it } from 'node:test';
import { loginRequestSchema, twoFactorLoginRequestSchema } from '../src';

it('accepts only boolean, optional session persistence preferences at both login steps', () => {
  const requests = [
    {
      schema: loginRequestSchema,
      input: { email: 'admin@example.test', password: 'fictional-password' },
    },
    {
      schema: twoFactorLoginRequestSchema,
      input: { challengeToken: 'x'.repeat(43), code: '123456' },
    },
  ];
  for (const { schema, input } of requests) {
    assert.equal(schema.safeParse(input).success, true);
    for (const rememberDevice of [true, false]) {
      assert.equal(
        schema.safeParse({ ...input, rememberDevice }).success,
        true,
      );
    }
    for (const rememberDevice of ['true', 'false', 1, null, {}]) {
      assert.equal(
        schema.safeParse({ ...input, rememberDevice }).success,
        false,
      );
    }
  }
});
