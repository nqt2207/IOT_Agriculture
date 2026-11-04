
import {
  IsIn,
  IsInt,
  IsString,
} from 'class-validator';

export class ActuatorControlDto {
  @IsString()
  esp32_id: string;

  @IsString()
  actuator: string;

  @IsInt()
  @IsIn([0, 1])
  state: number;
}
