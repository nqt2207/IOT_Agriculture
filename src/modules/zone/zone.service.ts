
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Zone } from 'src/databases/entities/zone.entity';
import { InfluxService } from '../influx/influx.service';

@Injectable()
export class ZoneService {
  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,

    private readonly influxService: InfluxService,
  ) {}

  // ==========================================
  // CHECK USER ACCESS TO ZONE
  // ==========================================

  private async validateZoneAccess(
    user: any,
    zoneId: string,
  ): Promise<Zone> {
    const userId = Number(user?.id ?? user?.sub);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException(
        'Invalid user information',
      );
    }

    const parsedZoneId = Number(zoneId);

    if (
      !Number.isInteger(parsedZoneId) ||
      parsedZoneId <= 0
    ) {
      throw new NotFoundException('Zone not found');
    }

    const zone = await this.zoneRepository.findOne({
      where: {
        id: parsedZoneId,
      },
      relations: {
        farm: true,
      },
    });

    if (!zone || !zone.farm) {
      throw new NotFoundException('Zone not found');
    }

    if (Number(zone.farm.user_id) !== userId) {
      throw new NotFoundException('Zone not found');
    }

    return zone;
  }

  // ==========================================
  // GET TANK STATUS FROM FARM
  // ==========================================

  async getTankStatus(
    user: any,
    zoneId: string,
  ) {
    const zone = await this.validateZoneAccess(
      user,
      zoneId,
    );

    return {
      farm_id: zone.farm.id,
      zone_id: zone.id,
      tank_status: zone.farm.tank_status ?? null,
      tank_status_updated_at:
        zone.farm.tank_status_updated_at ?? null,
      status:
        zone.farm.tank_status === 0
          ? 'AVAILABLE'
          : zone.farm.tank_status === 1
            ? 'EMPTY'
            : 'UNKNOWN',
    };
  }

  // ==========================================
  // GET LATEST TELEMETRY
  // ==========================================

  async getLatestTelemetry(
    user: any,
    zoneId: string,
  ) {
    const zone = await this.validateZoneAccess(
      user,
      zoneId,
    );

    return this.influxService.getLatestTelemetry(
      String(zone.id),
    );
  }

  // ==========================================
  // GET TELEMETRY HISTORY
  // ==========================================

  async getTelemetry(
    user: any,
    zoneId: string,
  ) {
    const zone = await this.validateZoneAccess(
      user,
      zoneId,
    );

    return this.influxService.getZoneTelemetry(
      String(zone.id),
    );
  }
}
