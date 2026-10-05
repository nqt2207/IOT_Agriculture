import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Req,
  NotFoundException,
} from '@nestjs/common';

import {
  ApiBearerAuth,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { FarmService } from './farm.service';

@ApiBearerAuth()
@Controller('farms')
export class FarmController {
  constructor(
    private readonly farmService: FarmService,
  ) {}

  @Get()
  async getMyFarms(
    @Req() request: Request,
  ) {
    const user = request['user'] as any;

    const userId = user?.id ?? user?.sub;

    return this.farmService.getMyFarms(userId);
  }

  @Get(':farmId/zones')
  async getZonesByFarm(
    @Param('farmId', ParseIntPipe) farmId: number,
    @Req() request: Request,
  ) {
    const user = request['user'] as any;

    const userId = user?.id ?? user?.sub;

    const zones = await this.farmService.getZonesByFarm(
      farmId,
      userId,
    );

    if (!zones) {
      throw new NotFoundException(
        'Farm not found',
      );
    }

    return zones;
  }
}