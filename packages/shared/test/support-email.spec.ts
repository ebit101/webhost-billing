import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  inboundSupportEmailSchema,
  signSupportDelivery,
  verifySupportDelivery,
  supportReplyAddress,
  supportThreadId,
  supportEmailText,
} from '../src/support-email';

const secret = 'fictional-command218-unit-secret-only';
test('opaque route binds domain, thread and dedicated secret with a bounded local part', () => {
  const id = randomUUID();
  const address = supportReplyAddress(id, secret, 'replies.example.test');
  assert.equal(supportThreadId(address, secret, 'replies.example.test'), id);
  assert.ok(address.split('@')[0]!.length <= 64);
  assert.equal(
    supportThreadId(address, 'different-secret', 'replies.example.test'),
    undefined,
  );
  assert.equal(
    supportThreadId(address, secret, 'other.example.test'),
    undefined,
  );
  assert.equal(
    supportThreadId('support@example.test', secret, 'replies.example.test'),
    undefined,
  );
});
test('delivery signature binds exact bytes and timestamp with bounded replay window', () => {
  const timestamp = '1793912400000';
  const bytes = Buffer.from('{"fictional":true}');
  const signature = signSupportDelivery(bytes, timestamp, secret);
  assert.equal(
    verifySupportDelivery(
      bytes,
      timestamp,
      signature,
      secret,
      Number(timestamp),
    ),
    true,
  );
  assert.equal(
    verifySupportDelivery(
      Buffer.from('changed'),
      timestamp,
      signature,
      secret,
      Number(timestamp),
    ),
    false,
  );
  assert.equal(
    verifySupportDelivery(
      bytes,
      timestamp,
      signature,
      secret,
      Number(timestamp) + 300001,
    ),
    false,
  );
  assert.equal(
    verifySupportDelivery(
      bytes,
      timestamp,
      signature,
      secret,
      Number(timestamp) - 300001,
    ),
    false,
  );
  assert.equal(
    verifySupportDelivery(bytes, timestamp, 'bad', secret, Number(timestamp)),
    false,
  );
});
test('HTML becomes plain text without active blocks, tags, remote requests or encoded markup', () => {
  assert.equal(
    supportEmailText({
      html: '<script>secret</script><p>Visible &amp; safe</p><img src="https://example.test/track">&#60;test&#62;',
    }),
    'Visible & safe\n test',
  );
  assert.equal(supportEmailText({ html: '<script>never closed' }), '');
});
test('prefer authored text and remove quoted history without importing old messages', () => {
  assert.equal(
    supportEmailText({
      text: 'New contribution\n> history',
      html: '<p>Not selected</p>',
    }),
    'New contribution',
  );
  assert.equal(
    supportEmailText({ text: 'New\nOn Friday someone wrote:\nOld' }),
    'New',
  );
});
test('strict envelope preserves case-sensitive route tokens and rejects sender header substitutions', () => {
  const envelope = {
    messageId: '<unit@example.test>',
    recipient: supportReplyAddress(
      randomUUID(),
      secret,
      'replies.example.test',
    ),
    from: 'Owner@example.test',
    envelopeFrom: 'owner@example.test',
    senderVerification: {
      dmarc: 'pass',
      alignedDkim: true,
      verifiedAddress: 'owner@example.test',
    },
    autoSubmitted: 'no',
    bulk: false,
    deliveryReport: false,
    text: 'Fictional',
    attachments: [],
  };
  const parsed = inboundSupportEmailSchema.parse(envelope);
  assert.equal(parsed.recipient, envelope.recipient);
  assert.equal(parsed.from, 'owner@example.test');
  assert.equal(
    inboundSupportEmailSchema.safeParse({
      ...envelope,
      headers: { from: 'owner@example.test' },
    }).success,
    false,
  );
  assert.equal(
    inboundSupportEmailSchema.safeParse({
      ...envelope,
      from: 'Owner <owner@example.test>',
    }).success,
    false,
  );
});
test('attachment envelope rejects unsupported names, base64 and more than three files', () => {
  const file = inboundSupportEmailSchema.shape.attachments.element;
  assert.equal(
    file.safeParse({
      filename: '../secret.txt',
      mediaType: 'text/plain',
      contentBase64: 'AAAA',
    }).success,
    false,
  );
  assert.equal(
    file.safeParse({
      filename: 'fictional.log',
      mediaType: 'text/plain',
      contentBase64: 'bad!',
    }).success,
    false,
  );
  assert.equal(
    inboundSupportEmailSchema.shape.attachments.safeParse(
      Array.from({ length: 4 }, () => ({
        filename: 'fictional.log',
        mediaType: 'text/plain',
        contentBase64: 'AAAA',
      })),
    ).success,
    false,
  );
});
