import { afterEach, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { uploadPrintFile } from '../src/lib/api';

const id = 'a'.repeat(32);
class FakeXHR {
  static requests: FakeXHR[] = [];
  url = ''; status = 200; responseText = '{}'; timeout = 0;
  headers: Record<string, string> = {};
  upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void; onload?: () => void } = {};
  onload?: () => void; onerror?: () => void; ontimeout?: () => void; onabort?: () => void;
  open(_method: string, url: string) { this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send() { FakeXHR.requests.push(this); }
  abort() { this.onabort?.(); }
}
function setup() {
  FakeXHR.requests = []; vi.stubGlobal('XMLHttpRequest', FakeXHR);
  const fetch = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(url.endsWith('/uploads') ? { id, chunkBytes: 4 } : { id }), { status: 201 }));
  vi.stubGlobal('fetch', fetch); return fetch;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('shows byte progress, waits for storage confirmation and sends authenticated chunks', async () => {
  const fetch = setup(); const progress = vi.fn();
  const pending = uploadPrintFile('session', new File(['ABCDEFGH'], 'model.stl'), 'folder', { onProgress: progress });
  let done = false; void pending.then(() => { done = true; });
  await waitFor(() => expect(FakeXHR.requests).toHaveLength(1));
  const first = FakeXHR.requests[0]!;
  first.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 4 });
  expect(progress).toHaveBeenLastCalledWith({ loaded: 2, total: 8, percent: 25, phase: 'uploading' });
  expect(first.headers.Authorization).toBe('Bearer session');
  first.onload?.();
  await waitFor(() => expect(FakeXHR.requests).toHaveLength(2));
  const second = FakeXHR.requests[1]!;
  second.upload.onload?.();
  expect(progress).toHaveBeenLastCalledWith({ loaded: 8, total: 8, percent: 100, phase: 'saving' });
  expect(done).toBe(false);
  second.onload?.(); await pending;
  expect(fetch).toHaveBeenCalledWith(`/api/admin/files/uploads/${id}/complete`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ folderId: 'folder' }) }));
});

it('retries only a timed-out part and does not create a duplicate upload', async () => {
  const fetch = setup(); const progress = vi.fn();
  const pending = uploadPrintFile('session', new File(['ABCD'], 'model.stl'), null, { onProgress: progress });
  await waitFor(() => expect(FakeXHR.requests).toHaveLength(1));
  FakeXHR.requests[0]!.ontimeout?.();
  await waitFor(() => expect(FakeXHR.requests).toHaveLength(2));
  expect(FakeXHR.requests[0]!.url).toBe(FakeXHR.requests[1]!.url);
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'retrying' }));
  FakeXHR.requests[1]!.onload?.(); await pending;
  expect(fetch.mock.calls.filter(([url]) => url === '/api/admin/files/uploads')).toHaveLength(1);
});

it('lets the user cancel and stops before completing the file', async () => {
  const fetch = setup(); const controller = new AbortController();
  const pending = uploadPrintFile('session', new File(['ABCD'], 'model.stl'), null, { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await waitFor(() => expect(FakeXHR.requests).toHaveLength(1));
  controller.abort(); await rejected;
  expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/complete'))).toBe(false);
  expect(fetch).toHaveBeenCalledWith(`/api/admin/files/uploads/${id}`, expect.objectContaining({ method: 'DELETE' }));
});
