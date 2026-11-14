
import {
  IsIn,
  IsInt,
  IsString,
  ValidateIf,
} from 'class-validator';

export class ActuatorControlDto {
  @IsString()
  esp32_id: string;

  @IsString()
  actuator: string;

  @IsIn(['SET_STATE', 'RETURN_TO_AUTO'])
  action: 'SET_STATE' | 'RETURN_TO_AUTO';

  @IsIn(['MANUAL', 'AUTO'])
  mode: 'MANUAL' | 'AUTO';

  @ValidateIf((dto) => dto.action === 'SET_STATE')
  @IsInt()
  @IsIn([0, 1])
  state?: number;
}
