import type { Recording } from './recording.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  createdAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName?: string;
}

/** Cursor/offset paginated list envelope used across list endpoints. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchQuery {
  q?: string;
  sourceType?: string;
  tags?: string[];
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  /** Include transcript full-text matches (slower). */
  includeTranscript?: boolean;
}

export type SearchResult = Paginated<Recording> & {
  query: SearchQuery;
};

/** Response when requesting a place to upload a chunk. */
export interface UploadTicket {
  /** Where the bytes go. For local driver this is an API path; for S3 a signed PUT URL. */
  uploadUrl: string;
  method: 'PUT' | 'POST';
  storageKey: string;
  /** Headers the client must echo back on the upload request. */
  headers?: Record<string, string>;
  expiresAt: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}
