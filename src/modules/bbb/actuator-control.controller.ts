
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

  @Post('control')
  @ApiOperation({
    summary: 'Điều khiển actuator thông qua BBB',
  })
  async controlActuator(
    @Body() dto: ActuatorControlDto,
  ) {
    return this.mqttTelemetryService.publishActuatorCommand(
      dto.esp32_id,
      dto.actuator,
      dto.action,
      dto.mode,
      dto.state,
    );
  }

  @Get('state')
  @ApiOperation({
    summary: 'Lấy trạng thái các actuator',
  })
  getActuatorState() {
    return this.mqttTelemetryService.getActuatorState();
  }
}
