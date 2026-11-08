
import {
  IsDefined,
  IsISO8601,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

export class SensorsDto {
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  humidity?: number;

  @IsOptional()
  @IsNumber()
  soil_moisture?: number;

  @IsOptional()
  @IsNumber()
  light?: number;

  @IsOptional()
  @IsNumber()
  water_flow?: number;

  @IsOptional()
  @IsNumber()
  water_volume?: number;

  // 0 = AVAILABLE, 1 = EMPTY
  @IsOptional()
  @IsIn([0, 1])
  tank_status?: number;
}

export class TelemetryDto {
  @IsOptional()
  @IsString()
  zone_id?: string;

  @IsString()
  esp32_id: string;

  @IsISO8601()
  timestamp: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => SensorsDto)
  sensors: SensorsDto;
}
