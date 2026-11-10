
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Query,
  UseGuards,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { BbbService } from './bbb.service';
import { MqttTelemetryService } from './mqtt-telemetry.service';
import { DeviceAuthGuard } from './guards/device-auth.guard';

import { Bbb } from 'src/databases/entities/bbb.entity';

import { TelemetryDto } from './dtos/telemetry.dto';
import { ActuatorStateDto } from './dtos/actuatorState.dto';

import { Public } from 'src/commons/decorators/public.decorator';
import { ROLE } from 'src/commons/enums/user.enum';
import { Roles } from 'src/commons/decorators/role.decorator';

@ApiTags('BBB')
@Controller('bbb')
export class BbbController {
  constructor(
    private readonly bbbService: BbbService,
    private readonly mqttTelemetryService: MqttTelemetryService,
  ) {}

  // ==========================================
  // BBB -> BACKEND: RECEIVE TELEMETRY
  // ==========================================

  @Post('telemetry')
  @Public()
  @UseGuards(DeviceAuthGuard)
  receiveTelemetry(
    @Req() request: Request,
    @Body() dto: TelemetryDto,
  ) {
    const bbb = request['bbb'] as Bbb;

    return this.bbbService.receiveTelemetry(bbb, dto);
  }

  // ==========================================
  // BBB -> BACKEND: RECEIVE ACTUATOR STATE
  // ==========================================

  @Post('actuator-state')
  @Public()
  @UseGuards(DeviceAuthGuard)
  receiveActuatorState(
    @Req() request: Request,
    @Body() dto: ActuatorStateDto,
  ) {
    const bbb = request['bbb'] as Bbb;

    return this.bbbService.receiveActuatorState(bbb, dto);
  }

  // ==========================================
  // FRONTEND -> BACKEND: GET ACTUATOR STATES
  // ==========================================

  @Get('actuators/state')
  @ApiBearerAuth()
  @Roles(ROLE.USER)
  getActuatorStates(
    @Req() request: Request,
  ) {
    const user = request['user'] as any;
    const userId = Number(user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException(
        'Invalid user information',
      );
    }

    return this.bbbService.getActuatorStatesByUser(
      userId,
    );
  }

  // ==========================================
  // FRONTEND -> BACKEND: SYNC ACTUATOR STATES
  // ==========================================

  @Get('actuators/sync-state')
  @ApiBearerAuth()
  @Roles(ROLE.USER)
  async syncActuatorStates(
    @Req() request: Request,
  ) {
    // STEP 1: Validate logged-in user

    const user = request['user'] as any;
    const userId = Number(user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException(
        'Invalid user information',
      );
    }

    // STEP 2: Get BBBs accessible by this user

    const userActuators =
      await this.bbbService.getActuatorStatesByUser(
        userId,
      );

    // Current MQTT service is configured for BBB_01.
    // Only a user owning this BBB can request its snapshot.

    const targetBbbId = 'BBB_01';

    const hasAccess =
      userActuators.actuators.some(
        (item) => item.bbb_id === targetBbbId,
      );

    if (!hasAccess) {
      throw new NotFoundException(
        'BBB not found or you do not have permission to access it',
      );
    }

    // STEP 3: Request real-time snapshot from BBB via MQTT.
    // This method waits for the correlated response.
    // If BBB does not respond, the MQTT service throws an error.

    const snapshot =
      await this.mqttTelemetryService.requestActuatorSync(
        targetBbbId,
      );

    // STEP 4: Return snapshot received from BBB
    // and persisted by BbbService.

    return {
      message: 'Actuator states synchronized successfully',
      data: snapshot,
    };
  }

  // ==========================================
  // FRONTEND -> BACKEND: GET ACTUATOR HISTORY
  // ==========================================

  @Get('actuators/history')
  @ApiBearerAuth()
  @Roles(ROLE.USER)
  getActuatorHistory(
    @Req() request: Request,
    @Query()
    query: {
      farm_id?: string;
      zone_id?: string;
      esp32_id?: string;
      actuator?: string;
      source?: string;
      from?: string;
      to?: string;
      page?: string;
      limit?: string;
    },
  ) {
    const user = request['user'] as any;
    const userId = Number(user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException(
        'Invalid user information',
      );
    }

    return this.bbbService.getActuatorHistoryByUser(
      userId,
      query,
    );
  }
}
