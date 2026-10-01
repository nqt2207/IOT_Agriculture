import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BbbController } from './bbb.controller';
import { BbbService } from './bbb.service';
import { DeviceAuthGuard } from './guards/device-auth.guard';
import { Bbb } from 'src/databases/entities/bbb.entity';
import { InfluxService } from '../influx/influx.service';
import { Zone } from 'src/databases/entities/zone.entity';
import { Esp32Device } from 'src/databases/entities/esp32.entity';



@Module({
  imports: [
    TypeOrmModule.forFeature([Bbb, Esp32Device,Zone]),
  ],

  controllers: [
    BbbController,
  ],

  providers: [
    BbbService,
    DeviceAuthGuard,
    InfluxService,
  ],

  exports: [
    BbbService,
  ],
})
export class BbbModule {}