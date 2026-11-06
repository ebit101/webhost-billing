import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTicketAttachmentSchema,
  replyToTicketRequestSchema,
  ticketAttachmentFilenameSchema,
} from '../src/contracts/tickets';

test('attachment metadata rejects paths, active extensions, excessive sizes and private storage fields', () => {
  const input = {
    submissionKey: '21700000-0000-4000-8000-000000000001',
    messageSubmissionKey: '21700000-0000-4000-8000-000000000002',
    filename: 'fictional.log',
    sizeBytes: 10,
    mediaType: 'text/plain',
  };
  assert.equal(createTicketAttachmentSchema.safeParse(input).success, true);
  for (const filename of [
    '../evidence.txt',
    'C:\\evidence.txt',
    'a/b.txt',
    'report.html',
    'screen.svg',
    'run.exe',
    'CON.txt',
    'a\r\n.txt',
  ])
    assert.equal(
      ticketAttachmentFilenameSchema.safeParse(filename).success,
      false,
    );
  for (const changed of [
    { sizeBytes: 0 },
    { sizeBytes: 2097153 },
    { mediaType: 'text/html' },
    { blobId: input.submissionKey },
    { scanner: 'clean' },
    { content: 'bytes' },
  ])
    assert.equal(
      createTicketAttachmentSchema.safeParse({ ...input, ...changed }).success,
      false,
    );
});
test('message manifests are bounded unique references rather than client-supplied file content', () => {
  const id = '21700000-0000-4000-8000-000000000001';
  assert.equal(
    replyToTicketRequestSchema.safeParse({
      submissionKey: id,
      body: 'Fictional reply',
      attachmentIds: [1, 2, 3, 4].map(
        (number) => `21700000-0000-4000-8000-00000000000${number}`,
      ),
    }).success,
    false,
  );
  assert.equal(
    replyToTicketRequestSchema.safeParse({
      submissionKey: id,
      body: 'Fictional reply',
      attachmentIds: [id],
    }).success,
    true,
  );
  assert.equal(
    replyToTicketRequestSchema.safeParse({
      submissionKey: id,
      body: 'Fictional reply',
      attachmentIds: [id, id],
    }).success,
    false,
  );
  assert.equal(
    replyToTicketRequestSchema.safeParse({
      submissionKey: id,
      body: 'Fictional reply',
      attachments: [{ content: 'raw' }],
    }).success,
    false,
  );
});
