import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Bbb } from 'src/databases/entities/bbb.entity';
import { TelemetryDto } from './dtos/telemetry.dto';
import { ActuatorStateDto } from './dtos/actuatorState.dto';
import { InfluxService } from '../influx/influx.service';

import { Zone } from 'src/databases/entities/zone.entity';
import { Esp32Device } from 'src/databases/entities/esp32.entity';


@Injectable()
export class BbbService {
  constructor(
    @InjectRepository(Bbb)
    private readonly bbbRepository: Repository<Bbb>,
    private readonly influxService: InfluxService,
    @InjectRepository(Esp32Device)
    private readonly esp32Repository: Repository<Esp32Device>,
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
  ) {}

  async findByDeviceId(device_id: string) {
    return this.bbbRepository.findOne({
      where: {
        device_id,
      },
    });
  }

  async receiveTelemetry(
    bbb: Bbb,
    dto: TelemetryDto,
  ) {
    console.log('Telemetry from:', bbb.device_id);

    if (Number(bbb.zone_id) !== Number(dto.zone_id)) {
    throw new BadRequestException(
      `Zone ID '${dto.zone_id}' does not match BBB's assigned zone '${bbb.zone_id}'`,
    );
  }

  // 2. Check ESP32: Tìm ESP32 theo bbb_id (bbb.id) và cột device_id (dto.esp32_id)
  const esp32 = await this.esp32Repository.findOne({
    where: {
      bbb_id: Number(bbb.id),
      device_id: dto.esp32_id, // So sánh với cột device_id trong bảng ESP32
    },
  });

  if (!esp32) {
    throw new BadRequestException(
      `ESP32 device_id '${dto.esp32_id}' does not belong to BBB '${bbb.device_id}'`,
    );
  }

    await this.influxService.writeTelemetry(
      bbb.device_id,
      dto.zone_id,
      dto.esp32_id,
      dto.timestamp,
      dto.sensors,
    );

    return {
      message: 'Telemetry received',
      device_id: bbb.device_id,
      zone_id: dto.zone_id,
      esp32_id: dto.esp32_id,
      timestamp: dto.timestamp,
    };
  }

  async receiveActuatorState(
    bbb: Bbb,
    dto: ActuatorStateDto,
  ) {
    console.log('Actuator state from:', bbb.device_id);

    await this.influxService.writeActuatorState(
      bbb.device_id,
      dto.zone_id,
      dto.actuator,
      dto.value,
      dto.timestamp,
    );

    return {
      message: 'Actuator state received',
      device_id: bbb.device_id,
      zone_id: dto.zone_id,
      actuator: dto.actuator,
      value: dto.value,
      timestamp: dto.timestamp,
    };
  }

  async getLatestTelemetry(zoneId: string) {
    return this.influxService.getLatestTelemetry(zoneId);
  }
}