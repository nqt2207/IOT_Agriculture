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

  @Get(':zoneId/telemetry/latest')
  @Roles(ROLE.USER)
  getLatestTelemetry(
    @Param('zoneId') zoneId: string,
    @Req() request: Request,
  ) {
    return this.zoneService.getLatestTelemetry(
      request['user'],
      zoneId,
    );
  }

  @Get(':zoneId/telemetry')
  @Roles(ROLE.USER)
  getTelemetry(
    @Param('zoneId') zoneId: string,
    @Req() request: Request,
  ) {
    return this.zoneService.getTelemetry(
      request['user'],
      zoneId,
    );
  }
}