import type {
  AudioChunk,
  AuthTokens,
  AuthUser,
  CommitChunkInput,
  Recording,
  SearchResult,
  UploadTicket,
} from '@echovault/shared';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3000';

const ACCESS_KEY = 'echovault.access';
const REFRESH_KEY = 'echovault.refresh';

export interface Session {
  user: AuthUser;
  tokens: AuthTokens;
}

/**
 * Thin API client. Persists tokens in localStorage and transparently refreshes
 * an expired access token once per request before failing.
 */
class ApiClient {
  private accessToken = localStorage.getItem(ACCESS_KEY) ?? '';
  private refreshToken = localStorage.getItem(REFRESH_KEY) ?? '';

  get isAuthenticated(): boolean {
    return Boolean(this.accessToken);
  }

  private setTokens(tokens: AuthTokens): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  }

  clearTokens(): void {
    this.accessToken = '';
    this.refreshToken = '';
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  private async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type') && init.body && !(init.body instanceof Blob)) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);

    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

    if (res.status === 401 && retry && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request<T>(path, init, false);
    }
    if (!res.ok) {
      const message = await res.text().catch(() => res.statusText);
      throw new Error(`${res.status}: ${message}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as Session;
      this.setTokens(data.tokens);
      return true;
    } catch {
      return false;
    }
  }

  // --- Auth ---
  async register(email: string, password: string, displayName?: string): Promise<Session> {
    const data = await this.request<{ user: AuthUser } & AuthTokens>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    const session = toSession(data);
    this.setTokens(session.tokens);
    return session;
  }

  async login(email: string, password: string): Promise<Session> {
    const data = await this.request<{ user: AuthUser } & AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const session = toSession(data);
    this.setTokens(session.tokens);
    return session;
  }

  // --- Recordings ---
  createRecording(input: Partial<Recording> & { id?: string }): Promise<Recording> {
    return this.request<Recording>('/recordings', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  listRecordings(): Promise<Recording[]> {
    return this.request<Recording[]>('/recordings');
  }

  completeRecording(id: string): Promise<Recording> {
    return this.request<Recording>(`/recordings/${id}/complete`, { method: 'POST' });
  }

  search(params: Record<string, string>): Promise<SearchResult> {
    const qs = new URLSearchParams(params).toString();
    return this.request<SearchResult>(`/search?${qs}`);
  }

  requestTranscription(id: string, summarize = true): Promise<{ status: string }> {
    return this.request(`/recordings/${id}/transcribe`, {
      method: 'POST',
      body: JSON.stringify({ summarize }),
    });
  }

  // --- Chunk upload (local-driver path) ---
  requestUploadTarget(input: {
    recordingId: string;
    channel: string;
    sequence: number;
    contentType?: string;
  }): Promise<UploadTicket> {
    return this.request<UploadTicket>('/chunks/upload-target', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async uploadBytes(ticket: UploadTicket, data: Blob): Promise<void> {
    const headers = new Headers(ticket.headers);
    // Local driver path is same-origin API and needs the bearer token.
    if (ticket.uploadUrl.startsWith(BASE_URL) && this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    const res = await fetch(ticket.uploadUrl, { method: ticket.method, headers, body: data });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  }

  commitChunk(input: CommitChunkInput): Promise<unknown> {
    return this.request('/chunks/commit', { method: 'POST', body: JSON.stringify(input) });
  }

  // --- Chunks (read) & export ---
  listChunks(recordingId: string): Promise<AudioChunk[]> {
    return this.request<AudioChunk[]>(`/chunks?recordingId=${encodeURIComponent(recordingId)}`);
  }

  /** Decrypted chunk bytes (for client-side WAV export / playback). */
  async getChunkBlob(chunkId: string): Promise<Blob> {
    const res = await this.authedFetch(`/chunks/${chunkId}/data`);
    if (!res.ok) throw new Error(`Chunk fetch failed: ${res.status}`);
    return res.blob();
  }

  /** Authed download of any server-generated file; parses the filename. */
  async getFile(path: string): Promise<{ blob: Blob; filename: string }> {
    const res = await this.authedFetch(path);
    if (!res.ok) {
      throw new Error(`${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    return { blob: await res.blob(), filename: match?.[1] ?? 'echovault-export' };
  }

  private authedFetch(path: string): Promise<Response> {
    const headers = new Headers();
    if (this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);
    return fetch(`${BASE_URL}${path}`, { headers });
  }
}

function toSession(data: { user: AuthUser } & AuthTokens): Session {
  return {
    user: data.user,
    tokens: { accessToken: data.accessToken, refreshToken: data.refreshToken },
  };
}

export const api = new ApiClient();
export { BASE_URL };
