import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Zone } from 'src/databases/entities/zone.entity';

import { ZoneController } from './zone.controller';
import { ZoneService } from './zone.service';

import { InfluxModule } from '../influx/influx.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Zone]),
    InfluxModule,
  ],
  controllers: [ZoneController],
  providers: [ZoneService],
  exports: [ZoneService],
})
export class ZoneModule {}