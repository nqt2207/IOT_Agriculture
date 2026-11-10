
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ActuatorStateDto {
  @IsString()
  esp32_id: string;

  @IsString()
  actuator: string;

  @IsIn([0, 1, null])
  value: number | null;

  @IsISO8601()
  timestamp: string;

  // ID của USER command cần xác nhận.
  // Giữ nguyên command_id do Backend tạo.
  @IsOptional()
  @IsInt()
  @Min(1)
  command_id?: number;
}
