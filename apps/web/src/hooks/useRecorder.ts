import { useCallback, useRef, useState } from 'react';
import {
  AudioRecorder,
  type AudioLevel,
  captureMicrophone,
  captureTabAudio,
  createRecoveryStore,
  type RecorderState,
} from '@echovault/audio-engine';
import {
  CHANNELS,
  DEFAULT_CHUNK_DURATION_MS,
  type RecordingChannel,
  type SourceType,
} from '@echovault/shared';
import { api } from '../lib/api';
import { UploadQueue } from '../lib/uploader';

export interface RecorderControlsState {
  status: RecorderState;
  durationMs: number;
  sizeBytes: number;
  chunkCount: number;
  pendingUploads: number;
  levels: Partial<Record<RecordingChannel, AudioLevel>>;
  recordingId?: string;
  error?: string;
  warning?: string;
}

export interface StartOptions {
  title: string;
  captureTab: boolean;
  captureMic: boolean;
  micDeviceId?: string;
  sourceType?: SourceType;
}

const initialState: RecorderControlsState = {
  status: 'idle',
  durationMs: 0,
  sizeBytes: 0,
  chunkCount: 0,
  pendingUploads: 0,
  levels: {},
};

export function useRecorder() {
  const [state, setState] = useState<RecorderControlsState>(initialState);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const uploaderRef = useRef<UploadQueue | null>(null);

  const patch = useCallback((p: Partial<RecorderControlsState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  const start = useCallback(
    async (opts: StartOptions) => {
      if (recorderRef.current) return;
      patch({ error: undefined, warning: undefined });

      try {
        // 1. Acquire streams (must run within the click gesture).
        let tabStream: MediaStream | undefined;
        let micStream: MediaStream | undefined;
        if (opts.captureTab) tabStream = await captureTabAudio();
        if (opts.captureMic) micStream = await captureMicrophone({ deviceId: opts.micDeviceId });
        if (!tabStream && !micStream) {
          throw new Error('Select at least one source (tab or microphone).');
        }

        // 2. Decide channels. Both sources => also keep a mixed-down channel.
        const channels: RecordingChannel[] = [];
        if (tabStream) channels.push(CHANNELS.tab);
        if (micStream) channels.push(CHANNELS.mic);
        if (tabStream && micStream) channels.push(CHANNELS.mixed);

        const sessionId = crypto.randomUUID();
        const store = createRecoveryStore();

        // 3. Create the recording server-side. If this fails (offline), keep
        //    recording locally — audio is never blocked on the network.
        let serverOk = true;
        try {
          await api.createRecording({
            id: sessionId,
            title: opts.title || 'Untitled recording',
            sourceType: opts.sourceType ?? 'manual',
            channels,
          });
        } catch {
          serverOk = false;
        }

        const uploader = new UploadQueue(
          sessionId,
          {
            onProgress: (pending) => patch({ pendingUploads: pending }),
            onError: (_chunk, err) => patch({ warning: `Upload retry exhausted: ${err.message}` }),
          },
          store,
        );
        uploaderRef.current = uploader;

        // 4. Build the recorder; persist-then-upload happens in onChunkReady.
        const recorder = new AudioRecorder(
          {
            sessionId,
            title: opts.title || 'Untitled recording',
            channels,
            chunkDurationMs: DEFAULT_CHUNK_DURATION_MS,
            metadata: { sourceType: opts.sourceType ?? 'manual' },
            tabStream,
            micStream,
            onChunkReady: (chunk, blob) => {
              if (serverOk) uploader.enqueue(chunk, blob);
            },
          },
          store,
        );
        recorderRef.current = recorder;

        recorder.events.on('state', ({ state: s }) => patch({ status: s }));
        recorder.events.on('level', ({ levels }) => patch({ levels }));
        recorder.events.on('progress', ({ durationMs, sizeBytes, chunkCount }) =>
          patch({ durationMs, sizeBytes, chunkCount }),
        );
        recorder.events.on('error', ({ error }) => patch({ warning: error.message }));

        await recorder.start();
        patch({
          recordingId: sessionId,
          status: 'recording',
          warning: serverOk
            ? undefined
            : 'Offline: recording locally. Will sync when the server is reachable.',
        });
      } catch (err) {
        recorderRef.current = null;
        patch({ status: 'error', error: (err as Error).message });
      }
    },
    [patch],
  );

  const pause = useCallback(() => recorderRef.current?.pause(), []);
  const resume = useCallback(() => recorderRef.current?.resume(), []);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    await recorder.stop();
    const id = state.recordingId;
    if (id) await api.completeRecording(id).catch(() => undefined);
    recorderRef.current = null;
    patch({ status: 'stopped' });
  }, [patch, state.recordingId]);

  const reset = useCallback(() => {
    recorderRef.current?.dispose();
    recorderRef.current = null;
    uploaderRef.current = null;
    setState(initialState);
  }, []);

  return { state, start, pause, resume, stop, reset };
}
