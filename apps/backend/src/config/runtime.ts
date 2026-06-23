/**
 * Runtime capability flags derived from the environment.
 *
 * The background queue (BullMQ + Redis) and its transcription worker require a
 * long-running process. That doesn't exist on serverless platforms, so the
 * queue is disabled automatically on Vercel, or explicitly via
 * ECHOVAULT_ENABLE_QUEUE=false. When disabled, the API still serves every
 * synchronous route (auth, recordings, chunked upload, search, transcript
 * reads); only on-demand transcription is unavailable.
 */
export const QUEUE_ENABLED =
  process.env.ECHOVAULT_ENABLE_QUEUE !== 'false' && !process.env.VERCEL;
