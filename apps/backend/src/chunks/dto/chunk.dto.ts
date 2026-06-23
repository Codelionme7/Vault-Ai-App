import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RequestUploadTargetDto {
  @ApiProperty()
  @IsString()
  recordingId!: string;

  @ApiProperty({ example: 'tab' })
  @IsString()
  channel!: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  sequence!: number;

  @ApiPropertyOptional({ example: 'audio/webm' })
  @IsOptional()
  @IsString()
  contentType?: string;
}

export class CommitChunkDto {
  @ApiProperty()
  @IsString()
  recordingId!: string;

  @ApiProperty({ example: 'tab' })
  @IsString()
  channel!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sequence!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  startOffsetMs!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  durationMs!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  byteLength!: number;

  @ApiProperty({ example: 'audio/webm;codecs=opus' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ description: 'Storage key returned by the upload-target request' })
  @IsString()
  storageKey!: string;

  @ApiPropertyOptional({ description: 'SHA-256 of the plaintext bytes for integrity' })
  @IsOptional()
  @IsString()
  checksum?: string;
}
