import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { InfluxService } from './influx.service';
import { InfluxController } from './influx.controller';

@Module({
  imports: [
    ConfigModule,
  ],

  controllers: [
    InfluxController,
  ],

  providers: [
    InfluxService,
  ],

  exports: [
    InfluxService,
  ],
})
export class InfluxModule {}