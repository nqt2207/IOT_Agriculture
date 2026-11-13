
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InfluxModule } from '../influx/influx.module';

import { Farm } from '../../databases/entities/farms.entity';
import { Zone } from '../../databases/entities/zone.entity';
import { Esp32Device } from '../../databases/entities/esp32.entity';
import { Actuator } from '../../databases/entities/actuator.entity';
import { ActuatorLog } from '../../databases/entities/actuator-log.entity';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    InfluxModule,

    TypeOrmModule.forFeature([
      Farm,
      Zone,
      Esp32Device,
      Actuator,
      ActuatorLog,
    ]),
  ],

  controllers: [AiController],

  providers: [AiService],

  exports: [AiService],
})
export class AiModule {}
