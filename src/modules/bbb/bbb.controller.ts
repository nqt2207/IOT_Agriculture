import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { BbbService } from './bbb.service';
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