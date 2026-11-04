
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsString,
} from 'class-validator';

export class ActuatorStateDto {
  @IsString()
  esp32_id: string;

  @IsString()
  actuator: string;

  @IsNumber()
  @IsIn([0, 1])
  value: number;

  @IsISO8601()
  timestamp: string;
}
