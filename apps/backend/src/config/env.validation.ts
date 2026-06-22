/**
 * Minimal, dependency-free env validation run at boot. Fails fast with a clear
 * message when production secrets are missing or malformed, while keeping a
 * frictionless local dev experience (sane defaults already applied elsewhere).
 */
export function validateEnv(env: NodeJS.ProcessEnv): void {
  const isProd = env.NODE_ENV === 'production';
  const errors: string[] = [];

  // Encryption key must be 32 bytes (64 hex chars) for AES-256.
  const key = env.ENCRYPTION_KEY;
  if (key && !/^[0-9a-fA-F]{64}$/.test(key)) {
    errors.push('ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256.');
  }

  if (isProd) {
    if (!env.DATABASE_URL) errors.push('DATABASE_URL is required in production.');
    if (!key || /^0+$/.test(key)) {
      errors.push('ENCRYPTION_KEY must be set to a real key in production.');
    }
    for (const secret of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (!env[secret] || env[secret]!.startsWith('change-me') || env[secret]!.startsWith('dev-')) {
        errors.push(`${secret} must be set to a strong value in production.`);
      }
    }
    if (env.STORAGE_DRIVER === 's3') {
      for (const k of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
        if (!env[k]) errors.push(`${k} is required when STORAGE_DRIVER=s3.`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }
}
