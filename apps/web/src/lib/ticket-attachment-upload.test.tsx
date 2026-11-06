import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { authMutation, authenticatedBinaryUpload } from './auth-api';
import {
  uploadTicketAttachments,
  clearTicketUploadDraft,
} from './ticket-attachment-upload';

vi.mock('./auth-api', () => ({
  authMutation: vi.fn(),
  authenticatedBinaryUpload: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

it('retains upload identity across a failed transfer and reuses a clean result on retry', async () => {
  const key = '21700000-0000-4000-8000-000000000001';
  const user = userEvent.setup();
  const { container } = render(
    <form>
      <label>
        Evidence
        <input type="file" name="attachments" />
      </label>
    </form>,
  );
  await user.upload(
    screen.getByLabelText('Evidence'),
    new File(['fictional'], 'evidence.log', { type: 'text/plain' }),
  );
  vi.mocked(authMutation)
    .mockResolvedValueOnce({ status: 'PENDING' })
    .mockResolvedValueOnce({ status: 'READY' });
  vi.mocked(authenticatedBinaryUpload).mockRejectedValueOnce(
    new Error('Fictional network failure'),
  );
  const form = container.querySelector('form')!;
  await expect(
    uploadTicketAttachments(form, key, undefined, key),
  ).rejects.toThrow('Fictional network failure');
  const ids = await uploadTicketAttachments(form, key, undefined, key);
  expect(ids).toHaveLength(1);
  expect(vi.mocked(authMutation).mock.calls[0]?.[2]).toEqual(
    vi.mocked(authMutation).mock.calls[1]?.[2],
  );
  expect(vi.mocked(authenticatedBinaryUpload)).toHaveBeenCalledOnce();
  expect(vi.mocked(authMutation).mock.calls[0]?.[2]).toMatchObject({
    submissionKey: ids[0],
    messageSubmissionKey: key,
    departmentId: key,
  });
  clearTicketUploadDraft(key);
});

it('rejects too many files and unsafe names before making an upload request', async () => {
  const user = userEvent.setup();
  const { container } = render(
    <form>
      <label>
        Evidence
        <input type="file" name="attachments" multiple />
      </label>
    </form>,
  );
  await user.upload(
    screen.getByLabelText('Evidence'),
    [1, 2, 3, 4].map((index) => new File(['fictional'], `${index}.txt`)),
  );
  await expect(
    uploadTicketAttachments(
      container.querySelector('form')!,
      crypto.randomUUID(),
    ),
  ).rejects.toThrow('three attachments');
  await user.upload(
    screen.getByLabelText('Evidence'),
    new File(['fictional'], '../unsafe.txt'),
  );
  await expect(
    uploadTicketAttachments(
      container.querySelector('form')!,
      crypto.randomUUID(),
    ),
  ).rejects.toThrow('simple');
  expect(authMutation).not.toHaveBeenCalled();
});
