import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Idempotent dev seed: a demo account with a couple of sample recordings so the
 * library/search UI has something to show on first run.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = 'demo@echovault.ai';
  const passwordHash = await bcrypt.hash('echovault-demo', 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, displayName: 'Demo User' },
  });

  const samples = [
    { title: 'Product weekly sync', sourceType: 'google_meet' as const, tags: ['standup'] },
    { title: 'Whisper deep-dive podcast', sourceType: 'podcast' as const, tags: ['research'] },
    { title: 'Voice memo — roadmap ideas', sourceType: 'manual' as const, tags: ['ideas'] },
  ];

  for (const s of samples) {
    const existing = await prisma.recording.findFirst({
      where: { ownerId: user.id, title: s.title },
    });
    if (existing) continue;
    await prisma.recording.create({
      data: {
        ownerId: user.id,
        title: s.title,
        sourceType: s.sourceType,
        status: 'completed',
        channels: ['mixed'],
        tags: s.tags,
        durationMs: 1_800_000,
        sizeBytes: 25_000_000,
        hasPendingUploads: false,
        metadata: { sourceType: s.sourceType },
        endedAt: new Date(),
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded user ${email} (password: echovault-demo) with sample recordings.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
