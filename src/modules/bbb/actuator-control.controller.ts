import {
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { MqttTelemetryService } from './mqtt-telemetry.service';
import { ActuatorControlDto } from './dtos/actuator-control.dto';

@ApiTags('Actuator Control')
@ApiBearerAuth()
@Controller('bbb/actuators')
export class ActuatorControlController {
  constructor(
    private readonly mqttTelemetryService: MqttTelemetryService,
  ) {}

  /**
   * Gửi lệnh điều khiển thiết bị tới BBB qua MQTT.
   *
   * POST /api/v1/bbb/actuators/control
   */
  @Post('control')
  @ApiOperation({
    summary: 'Điều khiển thiết bị thông qua BBB',
  })
  async controlActuator(
    @Body() dto: ActuatorControlDto,
  ) {
    return this.mqttTelemetryService.publishActuatorCommand(
      dto.actuator,
      dto.state,
    );
  }

  /**
   * Lấy trạng thái mô phỏng của các thiết bị.
   *
   * GET /api/v1/bbb/actuators/state
   */
  @Get('state')
  @ApiOperation({
    summary: 'Lấy trạng thái các thiết bị',
  })
  getActuatorState() {
    return this.mqttTelemetryService.getActuatorState();
  }
}