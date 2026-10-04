import { Module } from '@nestjs/common';

import { ZoneController } from './zone.controller';
import { ZoneService } from './zone.service';

import { InfluxModule } from '../influx/influx.module';

@Module({
  imports: [
    InfluxModule,
  ],

  controllers: [
    ZoneController,
  ],

  providers: [
    ZoneService,
  ],

  exports: [
    ZoneService,
  ],
})
export class ZoneModule {}