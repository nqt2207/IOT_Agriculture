import {
  IsISO8601,
  IsNumber,
  IsString,
} from 'class-validator';

export class ActuatorStateDto {
  @IsString()
  zone_id: string;

  @IsString()
  actuator: string;

  @IsNumber()
  value: number;

  @IsISO8601()
  timestamp: string;
}