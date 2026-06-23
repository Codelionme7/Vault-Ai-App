/** Strongly-typed application configuration, sourced from environment. */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiBaseUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
  encryptionKeyHex: string;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  storage: {
    driver: 'local' | 's3';
    localPath: string;
    s3: {
      endpoint?: string;
      region: string;
      bucket: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      forcePathStyle: boolean;
      signedUrlTtl: number;
    };
  };
  transcription: {
    driver: 'none' | 'openai' | 'local-whisper';
    openaiApiKey?: string;
    whisperServiceUrl?: string;
  };
  export: {
    /** Path to an ffmpeg binary; enables wav/mp3/flac export when set. */
    ffmpegPath?: string;
  };
  summary: {
    /** "auto" uses Claude when ANTHROPIC_API_KEY is set, else the heuristic. */
    driver: 'auto' | 'anthropic' | 'heuristic';
    anthropicApiKey?: string;
    anthropicModel: string;
  };
  search: {
    /** Use Postgres full-text (tsvector) search for the `q` term. */
    fts: boolean;
  };
}

const toInt = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
};

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 3000),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessTtl: toInt(process.env.JWT_ACCESS_TTL, 900),
    refreshTtl: toInt(process.env.JWT_REFRESH_TTL, 2_592_000),
  },
  encryptionKeyHex:
    process.env.ENCRYPTION_KEY ??
    '0000000000000000000000000000000000000000000000000000000000000000',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: toInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER as 'local' | 's3') ?? 'local',
    localPath: process.env.STORAGE_LOCAL_PATH ?? './storage',
    s3: {
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION ?? 'auto',
      bucket: process.env.S3_BUCKET ?? 'echovault',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
      signedUrlTtl: toInt(process.env.S3_SIGNED_URL_TTL, 900),
    },
  },
  transcription: {
    driver: (process.env.TRANSCRIPTION_DRIVER as 'none' | 'openai' | 'local-whisper') ?? 'none',
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    whisperServiceUrl: process.env.WHISPER_SERVICE_URL || undefined,
  },
  export: {
    ffmpegPath: process.env.FFMPEG_PATH || undefined,
  },
  summary: {
    driver: (process.env.SUMMARY_DRIVER as 'auto' | 'anthropic' | 'heuristic') ?? 'auto',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
  },
  search: {
    fts: (process.env.SEARCH_FTS ?? 'true') !== 'false',
  },
});
