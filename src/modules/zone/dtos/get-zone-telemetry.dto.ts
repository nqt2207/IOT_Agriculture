// src/zone/dto/get-zone-telemetry.dto.ts

import { IsDateString, IsOptional } from 'class-validator';

export class GetZoneTelemetryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}