import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { BbbService } from './bbb.service';
import { DeviceAuthGuard } from './guards/device-auth.guard';

import { Bbb } from 'src/databases/entities/bbb.entity';
import { TelemetryDto } from './dtos/telemetry.dto';
import { ActuatorStateDto } from './dtos/actuatorState.dto';
import { Public } from 'src/commons/decorators/public.decorator';
import { User } from 'src/databases/entities/user.entity';
import { ROLE } from 'src/commons/enums/user.enum';
import { Roles } from 'src/commons/decorators/role.decorator';

@Controller('bbb')
@UseGuards(DeviceAuthGuard)
export class BbbController {
  constructor(
    private readonly bbbService: BbbService,
  ) {}

  @Post('telemetry')
  @Public()
  receiveTelemetry(
    @Req() request: Request,
    @Body() dto: TelemetryDto,
  ) {
    //console.log('>>> CONTROLLER CALLED');


    const bbb = request['bbb'] as Bbb;

    return this.bbbService.receiveTelemetry(
      bbb,
      dto,
    );
  }

  @Post('actuator-state')
  @Public()
  receiveActuatorState(
    @Req() request: Request,
    @Body() dto: ActuatorStateDto,
  ) {
    const bbb = request['bbb'] as Bbb;

    return this.bbbService.receiveActuatorState(
      bbb,
      dto,
    );
  }

  @Get('telemetry/latest')
  @Public()
  //@Roles(ROLE.USER)
  async getLatestTelemetry(
  @Query('zone_id') zoneId: string,
  ) {
  return this.bbbService.getLatestTelemetry(zoneId);
  }
}