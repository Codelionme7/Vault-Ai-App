// Vercel serverless entrypoint — routes every `/api/*` request into the NestJS
// app. The catch-all filename means Vercel sends all nested paths here, and the
// app's global `/api` prefix makes Express match the original URL unchanged.
import type { IncomingMessage, ServerResponse } from 'node:http';
// Built by `vercel-build` (apps/backend → dist). No declarations are emitted for
// the app build, so this import is intentionally untyped.
// @ts-expect-error -- compiled JS produced at build time
import { createApp } from '../apps/backend/dist/serverless.js';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const app = await createApp();
  app(req, res);
}
