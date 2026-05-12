import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listAttachmentsMock = vi.fn();
const uploadAttachmentMock = vi.fn();
const deleteAttachmentMock = vi.fn();
const getAttachmentSignedUrlMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  listAttachments: (scope: unknown) => listAttachmentsMock(scope),
  uploadAttachment: (opts: unknown) => uploadAttachmentMock(opts),
  deleteAttachment: (id: string) => deleteAttachmentMock(id),
  getAttachmentSignedUrl: (path: string, expires?: number) =>
    getAttachmentSignedUrlMock(path, expires),
}));

import AttachmentsPanel from '../AttachmentsPanel';
import type { TicketAttachment } from '../../types';

const PNG: TicketAttachment = {
  id: 'att-1',
  ticketId: 't-1',
  repairOrderId: null,
  storagePath: 'tickets/t-1/foto.png',
  filename: 'foto.png',
  contentType: 'image/png',
  sizeBytes: 12345,
  uploadedBy: 'emp-a',
  createdAt: '2026-05-12T10:00:00Z',
};

const PDF: TicketAttachment = {
  ...PNG,
  id: 'att-2',
  storagePath: 'tickets/t-1/spec.pdf',
  filename: 'spec.pdf',
  contentType: 'application/pdf',
  sizeBytes: 200000,
};

beforeEach(() => {
  listAttachmentsMock.mockReset().mockResolvedValue([]);
  uploadAttachmentMock.mockReset().mockImplementation(async (opts: any) => ({
    ...PNG,
    id: 'att-new',
    filename: opts.filename,
  }));
  deleteAttachmentMock.mockReset().mockResolvedValue(undefined);
  getAttachmentSignedUrlMock.mockReset().mockResolvedValue('https://signed.url/x');
});

describe('AttachmentsPanel', () => {
  it('shows an empty state when there are no attachments', async () => {
    render(<AttachmentsPanel scope={{ ticketId: 't-1' }} />);
    await waitFor(() => expect(listAttachmentsMock).toHaveBeenCalled());
    expect(screen.getByText(/Keine Anhänge/)).toBeInTheDocument();
  });

  it('lists existing attachments with filename + size', async () => {
    listAttachmentsMock.mockResolvedValueOnce([PNG, PDF]);
    render(<AttachmentsPanel scope={{ ticketId: 't-1' }} />);
    await screen.findByText('foto.png');
    expect(screen.getByText('spec.pdf')).toBeInTheDocument();
    expect(screen.getAllByTestId('attachment-row')).toHaveLength(2);
  });

  it('uploads a file via the hidden input and prepends it to the list', async () => {
    const u = userEvent.setup();
    render(
      <AttachmentsPanel scope={{ ticketId: 't-1' }} currentEmployeeId="emp-a" />,
    );
    await waitFor(() => expect(listAttachmentsMock).toHaveBeenCalled());

    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const input = screen.getByTestId('attachment-file-input') as HTMLInputElement;
    await u.upload(input, file);

    await waitFor(() => expect(uploadAttachmentMock).toHaveBeenCalled());
    const opts = uploadAttachmentMock.mock.calls[0][0];
    expect(opts.ticketId).toBe('t-1');
    expect(opts.filename).toBe('note.txt');
    expect(opts.uploadedBy).toBe('emp-a');
    expect(await screen.findByText('note.txt')).toBeInTheDocument();
  });

  it('hides upload + delete when editable=false', async () => {
    listAttachmentsMock.mockResolvedValueOnce([PNG]);
    render(<AttachmentsPanel scope={{ ticketId: 't-1' }} editable={false} />);
    await screen.findByText('foto.png');
    expect(screen.queryByTestId('attachment-upload-btn')).not.toBeInTheDocument();
    // No Trash icon button on the row
    expect(screen.queryByRole('button', { name: 'Entfernen' })).not.toBeInTheDocument();
  });

  it('passes the right scope through to listAttachments for repair_order_id', async () => {
    render(<AttachmentsPanel scope={{ repairOrderId: 'ro-1' }} />);
    await waitFor(() => expect(listAttachmentsMock).toHaveBeenCalled());
    expect(listAttachmentsMock).toHaveBeenCalledWith({ repairOrderId: 'ro-1' });
  });
});
