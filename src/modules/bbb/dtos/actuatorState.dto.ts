
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
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

  // ID của lệnh MANUAL cần xác nhận.
  // Các trạng thái AUTO hoặc trạng thái khởi động
  // có thể không có command_id.

  @IsOptional()
  @IsInt()
  @Min(1)
  command_id?: number;
}
