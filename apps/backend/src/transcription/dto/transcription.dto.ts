import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RequestTranscriptionDto {
  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Attempt speaker diarization' })
  @IsOptional()
  @IsBoolean()
  diarize?: boolean;

  @ApiPropertyOptional({ description: 'Also generate a summary when complete' })
  @IsOptional()
  @IsBoolean()
  summarize?: boolean;
}
