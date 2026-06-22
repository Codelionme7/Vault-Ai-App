import { Module } from '@nestjs/common';
import { RecordingsModule } from '../recordings/recordings.module';
import { ChunksController } from './chunks.controller';
import { ChunksService } from './chunks.service';

@Module({
  imports: [RecordingsModule],
  controllers: [ChunksController],
  providers: [ChunksService],
  exports: [ChunksService],
})
export class ChunksModule {}
