import {
  IsISO8601,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';


export class SensorsDto {
  @IsNumber()
  temperature: number;

  @IsNumber()
  humidity: number;

  @IsNumber()
  soil_moisture: number;

  @IsNumber()
  light: number;

  @IsNumber()
  water_flow: number;

  @IsNumber()
  water_volume: number;

  @IsNumber()
  tank_status: number;
}

export class TelemetryDto {
  @IsString()
  zone_id: string;

  @IsString()
  esp32_id: string;

  @IsISO8601()
  timestamp: string;

  @ValidateNested()
  @Type(() => SensorsDto)
  sensors: SensorsDto;
}