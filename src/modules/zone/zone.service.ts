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
    // 1. Lấy user ID từ JWT payload
    const userId = Number(user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Invalid user information');
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException(
        'Invalid user information',
      );
    }

    // 2. Kiểm tra zone ID
    const parsedZoneId = Number(zoneId);

    if (
      !Number.isInteger(parsedZoneId) ||
      parsedZoneId <= 0
    ) {
      throw new NotFoundException('Zone not found');
    }

    // 3. Tìm Zone và Farm sở hữu Zone đó
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

    // 4. Kiểm tra quyền sở hữu Farm
    if (zone.farm.user_id !== userId) {
      // Không tiết lộ Zone có tồn tại hay không
      throw new NotFoundException('Zone not found');
    }

    return zone;
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