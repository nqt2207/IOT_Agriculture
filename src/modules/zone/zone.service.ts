import {
  Injectable,
} from '@nestjs/common';

import { InfluxService } from '../influx/influx.service';

@Injectable()
export class ZoneService {
  constructor(
    private readonly influxService: InfluxService,
  ) {}

  async getLatestTelemetry(user: any, zoneId: string) {
  console.log('>>> ZONE SERVICE');
  console.log('>>> zoneId:', zoneId);

  const result = await this.influxService.getLatestTelemetry(zoneId);

  console.log('>>> INFLUX RESULT:', result);

  return result;
}

  async getTelemetry(
    user: any,
    zoneId: string,
  ) {
    return this.influxService.getZoneTelemetry(
      zoneId,
    );
  }
}