import { IsIn, IsInt, IsString } from 'class-validator';

export class ActuatorControlDto {
  @IsString()
  @IsIn(['pump1', 'pump2', 'fan', 'light'])
  actuator: string;

  @IsInt()
  @IsIn([0, 1])
  state: number;
}