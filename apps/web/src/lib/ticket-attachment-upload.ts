import type { TicketAttachment } from '@webhost-billing/shared';
import {
  TICKET_ATTACHMENT_MAX_BYTES,
  ticketAttachmentFilenameSchema,
} from '@webhost-billing/shared';
import { authMutation, authenticatedBinaryUpload } from './auth-api';

const uploadIds = new Map<string, string>();

/** Draft identity survives a retry, including a lost successful message response. */
export async function uploadTicketAttachments(
  form: HTMLFormElement,
  submissionKey: string,
  ticketId?: string,
  departmentId?: string,
): Promise<string[]> {
  const input = form.querySelector<HTMLInputElement>(
    'input[name="attachments"]',
  );
  const files = Array.from(input?.files ?? []);
  if (files.length > 3)
    throw new Error('Choose no more than three attachments.');
  const ids: string[] = [];
  for (const [index, file] of files.entries()) {
    if (
      !ticketAttachmentFilenameSchema.safeParse(file.name).success ||
      !file.size ||
      file.size > TICKET_ATTACHMENT_MAX_BYTES
    )
      throw new Error(
        'Use a simple PNG/JPEG or text/log filename and a file up to 2 MiB.',
      );
    const key = `${submissionKey}:${index}:${file.name}:${file.size}:${file.lastModified}`;
    const id = uploadIds.get(key) ?? crypto.randomUUID();
    uploadIds.set(key, id);
    const mediaType = /\.(txt|log)$/i.test(file.name)
      ? 'text/plain'
      : /\.png$/i.test(file.name)
        ? 'image/png'
        : 'image/jpeg';
    const intent = await authMutation<TicketAttachment>(
      '/tickets/attachment-uploads',
      'POST',
      {
        submissionKey: id,
        messageSubmissionKey: submissionKey,
        ...(ticketId ? { ticketId } : { departmentId }),
        filename: file.name,
        sizeBytes: file.size,
        mediaType,
      },
    );
    if (intent.status !== 'READY' && intent.status !== 'ATTACHED')
      await authenticatedBinaryUpload(
        `/tickets/attachment-uploads/${id}/content`,
        file,
      );
    ids.push(id);
  }
  return ids;
}

export function clearTicketUploadDraft(key: string) {
  for (const id of uploadIds.keys())
    if (id.startsWith(`${key}:`)) uploadIds.delete(id);
}
