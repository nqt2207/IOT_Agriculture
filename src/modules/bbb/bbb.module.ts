
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BbbController } from './bbb.controller';
import { BbbService } from './bbb.service';
import { DeviceAuthGuard } from './guards/device-auth.guard';

import { Bbb } from 'src/databases/entities/bbb.entity';
import { Zone } from 'src/databases/entities/zone.entity';
import { Esp32Device } from 'src/databases/entities/esp32.entity';
import { Actuator } from 'src/databases/entities/actuator.entity';
import { ActuatorLog } from 'src/databases/entities/actuator-log.entity';

import { InfluxService } from '../influx/influx.service';
import { MqttTelemetryService } from './mqtt-telemetry.service';
import { TelemetryGateway } from './telemetry.gateway';
import { ActuatorControlController } from './actuator-control.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Bbb,
      Esp32Device,
      Zone,
      Actuator,
      ActuatorLog,
    ]),
  ],

  controllers: [
    BbbController,
    ActuatorControlController,
  ],

  providers: [
    BbbService,
    DeviceAuthGuard,
    InfluxService,
    MqttTelemetryService,
    TelemetryGateway,
  ],

  exports: [
    BbbService,
  ],
})
export class BbbModule {}
