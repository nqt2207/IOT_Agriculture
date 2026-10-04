import {
  Controller,
  Get,
  Param,
  Req,
} from '@nestjs/common';

import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';

import { ZoneService } from './zone.service';
import { Roles } from 'src/commons/decorators/role.decorator';
import { ROLE } from 'src/commons/enums/user.enum';

@ApiBearerAuth()
@Controller('zones')
export class ZoneController {
  constructor(
    private readonly zoneService: ZoneService,
  ) {}

  @Roles(ROLE.USER)
  @Get(':zoneId/telemetry/latest')
  getLatestTelemetry(
    @Param('zoneId') zoneId: string,
    @Req() request: Request,
  ) {
    console.log('>>> ZONE CONTROLLER CALLED');
    console.log('>>> ZONE ID:', zoneId);
    console.log('>>> USER:', request['user']);

    const user = request['user'];

    return this.zoneService.getLatestTelemetry(
      user,
      zoneId,
    );
  }

  @Roles(ROLE.USER)
  @Get(':zoneId/telemetry')
  getTelemetry(
    @Param('zoneId') zoneId: string,
    @Req() request: Request,
  ) {
    const user = request['user'];

    return this.zoneService.getTelemetry(
      user,
      zoneId,
    );
  }
}