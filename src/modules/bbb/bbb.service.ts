
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Bbb } from 'src/databases/entities/bbb.entity';
import { Zone } from 'src/databases/entities/zone.entity';
import { Esp32Device } from 'src/databases/entities/esp32.entity';

import { TelemetryDto } from './dtos/telemetry.dto';
import { ActuatorStateDto } from './dtos/actuatorState.dto';

import { Actuator } from 'src/databases/entities/actuator.entity';
import { ActuatorLog } from 'src/databases/entities/actuator-log.entity';
import { InfluxService } from '../influx/influx.service';

import { Farm } from 'src/databases/entities/farms.entity';

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

    @InjectRepository(Actuator)
    private readonly actuatorRepository: Repository<Actuator>,

    @InjectRepository(ActuatorLog)
    private readonly actuatorLogRepository: Repository<ActuatorLog>,

    @InjectRepository(Farm)
    private readonly farmRepository: Repository<Farm>,
  ) {}

  // =========================================
  // 1. FIND BBB
  // =========================================

  async findByDeviceId(device_id: string) {
    return this.bbbRepository.findOne({
      where: {
        device_id,
      },
    });
  }

  // =========================================
  // 2. RECEIVE TELEMETRY
  // =========================================

  async receiveTelemetry(
    bbb: Bbb,
    dto: TelemetryDto,
  ) {
    console.log('Telemetry from:', bbb.device_id);

    // STEP 1: Find ESP32 belonging to this BBB

    const esp32 = await this.esp32Repository.findOne({
      where: {
        bbb_id: Number(bbb.id),
        device_id: dto.esp32_id,
      },
    });

    if (!esp32) {
      throw new BadRequestException(
        `ESP32 '${dto.esp32_id}' does not belong to BBB '${bbb.device_id}'`,
      );
    }

    // STEP 2: Validate according to device scope

    const hasZoneId =
      dto.zone_id !== undefined &&
      dto.zone_id !== null &&
      dto.zone_id !== '';

    let zoneId: string | null = null;

    // CASE A: ZONE-LEVEL DEVICE

    if (esp32.scope === 'zone') {
      if (!hasZoneId) {
        throw new BadRequestException(
          `zone_id is required for ESP32 '${dto.esp32_id}'`,
        );
      }

      const parsedZoneId = Number(dto.zone_id);

      if (
        !Number.isInteger(parsedZoneId) ||
        parsedZoneId <= 0
      ) {
        throw new BadRequestException(
          `Invalid zone_id '${dto.zone_id}'`,
        );
      }

      const zone = await this.zoneRepository.findOne({
        where: {
          id: parsedZoneId,
          farm_id: Number(bbb.farm_id),
        },
      });

      if (!zone) {
        throw new BadRequestException(
          `Zone '${dto.zone_id}' does not belong to BBB's Farm '${bbb.farm_id}'`,
        );
      }

      if (Number(esp32.zone_id) !== parsedZoneId) {
        throw new BadRequestException(
          `ESP32 '${dto.esp32_id}' is not assigned to Zone '${dto.zone_id}'`,
        );
      }

      zoneId = String(parsedZoneId);
    }

    // CASE B: FARM-LEVEL DEVICE

    else if (esp32.scope === 'farm') {
      if (hasZoneId) {
        throw new BadRequestException(
          `Farm-level ESP32 '${dto.esp32_id}' must not contain zone_id`,
        );
      }

      if (
        esp32.zone_id !== null &&
        esp32.zone_id !== undefined
      ) {
        throw new BadRequestException(
          `Farm-level ESP32 '${dto.esp32_id}' must have zone_id = NULL`,
        );
      }

      zoneId = null;
    }

    // CASE C: INVALID SCOPE

    else {
      throw new BadRequestException(
        `Invalid scope '${esp32.scope}' for ESP32 '${dto.esp32_id}'`,
      );
    }

    // STEP 3: Write telemetry to InfluxDB

    await this.influxService.writeTelemetry(
      bbb.device_id,
      zoneId,
      dto.esp32_id,
      dto.timestamp,
      dto.sensors,
    );

    // STEP 4: UPDATE FARM TANK STATUS FROM NODE3

    if (dto.sensors.tank_status !== undefined) {
      if (
        esp32.device_id !== 'ESP32_NODE3' ||
        esp32.scope !== 'farm'
      ) {
        throw new BadRequestException(
          'Only farm-level ESP32_NODE3 can update tank_status',
        );
      }

      const tankStatus = dto.sensors.tank_status;

      // 0 = EMPTY
      // 1 = AVAILABLE

      if (tankStatus !== 0 && tankStatus !== 1) {
        throw new BadRequestException(
          'tank_status must be 0 (EMPTY) or 1 (AVAILABLE)',
        );
      }

      const updatedAt = new Date(dto.timestamp);

      if (Number.isNaN(updatedAt.getTime())) {
        throw new BadRequestException(
          'Invalid tank_status timestamp',
        );
      }

      const result = await this.farmRepository.update(
        {
          id: Number(bbb.farm_id),
        },
        {
          tank_status: tankStatus,
          tank_status_updated_at: updatedAt,
        },
      );

      if (!result.affected) {
        throw new BadRequestException(
          `Farm '${bbb.farm_id}' not found`,
        );
      }

      console.log(
        `Tank status updated: Farm=${bbb.farm_id} | ${
          tankStatus === 0 ? 'EMPTY' : 'AVAILABLE'
        }`,
      );
    }

    console.log(
      `Telemetry saved: ${dto.esp32_id} | scope=${esp32.scope} | zone=${zoneId}`,
    );

    return {
      message: 'Telemetry received',
      device_id: bbb.device_id,
      esp32_id: dto.esp32_id,
      scope: esp32.scope,
      zone_id: zoneId,
      timestamp: dto.timestamp,
    };
  }

  // =========================================
  // 3. RECEIVE ACTUATOR STATE
  // =========================================

  async receiveActuatorState(
    bbb: Bbb,
    dto: ActuatorStateDto,
  ) {
    console.log('Actuator state from:', bbb.device_id);

    // STEP 1: Find ESP32 belonging to BBB

    const esp32 = await this.esp32Repository.findOne({
      where: {
        bbb_id: Number(bbb.id),
        device_id: dto.esp32_id,
      },
    });

    if (!esp32) {
      throw new BadRequestException(
        `ESP32 '${dto.esp32_id}' does not belong to BBB '${bbb.device_id}'`,
      );
    }

    // STEP 2: Validate scope and determine Zone

    let zoneId: string | null = null;

    if (esp32.scope === 'zone') {
      if (
        esp32.zone_id === null ||
        esp32.zone_id === undefined
      ) {
        throw new BadRequestException(
          `Zone-level ESP32 '${dto.esp32_id}' has no assigned zone`,
        );
      }

      const zone = await this.zoneRepository.findOne({
        where: {
          id: Number(esp32.zone_id),
          farm_id: Number(bbb.farm_id),
        },
      });

      if (!zone) {
        throw new BadRequestException(
          `Invalid Zone assignment for ESP32 '${dto.esp32_id}'`,
        );
      }

      zoneId = String(zone.id);
    } else if (esp32.scope === 'farm') {
      if (
        esp32.zone_id !== null &&
        esp32.zone_id !== undefined
      ) {
        throw new BadRequestException(
          `Farm-level ESP32 '${dto.esp32_id}' must not have a zone`,
        );
      }
    } else {
      throw new BadRequestException(
        `Invalid ESP32 scope '${esp32.scope}'`,
      );
    }

    // STEP 3: Find actuator

    const actuator = await this.actuatorRepository.findOne({
      where: {
        esp32_id: esp32.id,
        name: dto.actuator,
      },
    });

    if (!actuator) {
      throw new BadRequestException(
        `Actuator '${dto.actuator}' does not belong to ESP32 '${dto.esp32_id}'`,
      );
    }

    // STEP 4: Validate timestamp

    const receivedAt = new Date(dto.timestamp);

    if (Number.isNaN(receivedAt.getTime())) {
      throw new BadRequestException(
        'Invalid actuator state timestamp',
      );
    }

    // value:
    // 0    = OFF
    // 1    = ON
    // null = UNKNOWN

    // STEP 5: Handle UNKNOWN

    if (dto.value === null) {
      console.warn(
        `Actuator UNKNOWN: ${dto.esp32_id}/${dto.actuator} | command_id=${dto.command_id ?? 'N/A'}`,
      );

      // Do not modify actual_state.
      // Do not convert UNKNOWN to OFF.
      // Do not update USER log actual_state.
      // Do not write UNKNOWN as physical state to InfluxDB.

      return {
        message: 'Actuator state is UNKNOWN',
        status: 'UNKNOWN',
        device_id: bbb.device_id,
        esp32_id: dto.esp32_id,
        zone_id: zoneId,
        actuator: dto.actuator,
        value: null,
        command_id: dto.command_id ?? null,
        actual_state: actuator.actual_state,
        timestamp: receivedAt.toISOString(),
      };
    }

    // STEP 6: Update actual_state

    const newState = dto.value === 1;

    actuator.actual_state = newState;
    actuator.state_updated_at = receivedAt;

    await this.actuatorRepository.save(actuator);
    
    // STEP 7: Update matching USER command log

    if (dto.command_id !== undefined) {
      const commandLog =
        await this.actuatorLogRepository.findOne({
          where: {
            id: dto.command_id,
            actuator_id: actuator.id,
            actuator_name: dto.actuator,
            source: 'USER',
          },
        });

      if (!commandLog) {
        console.warn(
          `Không tìm thấy USER log cho command_id=${dto.command_id}, actuator=${dto.actuator}`,
        );
      } else if (
        commandLog.commanded_state === null ||
        commandLog.commanded_state === undefined
      ) {
        // Đây là log chuyển AUTO, không phải lệnh ON/OFF.
        // Feedback ON/OFF không được dùng để xác nhận
        // trạng thái chuyển mode.

        console.log(
          `Feedback received for AUTO transition request: command_id=${dto.command_id}`,
        );
      } else if (
        commandLog.commanded_state !== newState
      ) {
        console.warn(
          `State mismatch: command_id=${dto.command_id}, commanded=${commandLog.commanded_state}, received=${newState}`,
        );
      } else if (
        commandLog.actual_state === null ||
        commandLog.actual_state === undefined
      ) {
        commandLog.actual_state = newState;

        await this.actuatorLogRepository.save(
          commandLog,
        );

        console.log(
          `Đã xác nhận USER command: command_id=${dto.command_id}, actual_state=${newState}`,
        );
      } else if (
        commandLog.actual_state === newState
      ) {
        console.log(
          `Bỏ qua ACK trùng lặp: command_id=${dto.command_id}`,
        );
      } else {
        console.warn(
          `Command đã có kết quả khác trước đó: command_id=${dto.command_id}`,
        );
      }
    }


    // STEP 8: Write state to InfluxDB

    await this.influxService.writeActuatorState(
      bbb.device_id,
      dto.esp32_id,
      zoneId,
      dto.actuator,
      dto.value,
      receivedAt.toISOString(),
    );

    // STEP 9: Return result

    return {
      message: 'Actuator state received',
      status: 'CONFIRMED',
      device_id: bbb.device_id,
      esp32_id: dto.esp32_id,
      zone_id: zoneId,
      actuator: dto.actuator,
      value: dto.value,
      actual_state: newState,
      command_id: dto.command_id ?? null,
      timestamp: receivedAt.toISOString(),
    };
  }

  // =========================================
  // 4. RECEIVE ACTUATOR SNAPSHOT FROM BBB
  // =========================================

  async receiveActuatorSnapshot(
    bbb: Bbb,
    snapshot: {
      action: string;
      request_id: string;
      bbb_id: string;
      timestamp: string;
      actuators: Array<{
        esp32_id: string;
        actuator: string;
        mode: string;
        desired_state: number | null;
        actual_state: number | null;
        reason?: string | null;
        timestamp: string;
      }>;
    },
  ) {
    // STEP 1: Validate snapshot header

    if (snapshot.action !== 'ACTUATOR_STATES') {
      throw new BadRequestException(
        'Invalid actuator snapshot action',
      );
    }

    if (snapshot.bbb_id !== bbb.device_id) {
      throw new UnauthorizedException(
        'BBB ID mismatch',
      );
    }

    if (
      !snapshot.request_id ||
      !Array.isArray(snapshot.actuators) ||
      !snapshot.timestamp ||
      Number.isNaN(Date.parse(snapshot.timestamp))
    ) {
      throw new BadRequestException(
        'Invalid actuator snapshot',
      );
    }

    // STEP 2: Process snapshot in a transaction

    const seen = new Set<string>();

    return this.actuatorRepository.manager.transaction(
      async (manager) => {
        const actuatorRepo =
          manager.getRepository(Actuator);

        const espRepo =
          manager.getRepository(Esp32Device);

        const zoneRepo =
          manager.getRepository(Zone);

        const results: Array<{
          actuator_id: number;
          esp32_id: string;
          zone_id: number | null;
          actuator: string;
          control_mode: string;
          desired_state: number | null;
          actual_state: number | null;
          reason: string | null;
          timestamp: string;
        }> = [];

        for (const item of snapshot.actuators) {
          // Validate individual item

          if (
            !item.esp32_id ||
            !item.actuator ||
            !['AUTO', 'MANUAL'].includes(item.mode) ||
            (
              item.desired_state !== 0 &&
              item.desired_state !== 1 &&
              item.desired_state !== null
            ) ||
            (
              item.actual_state !== 0 &&
              item.actual_state !== 1 &&
              item.actual_state !== null
            ) ||
            !item.timestamp ||
            Number.isNaN(Date.parse(item.timestamp))
          ) {
            throw new BadRequestException(
              `Invalid actuator snapshot item: ${item.esp32_id}/${item.actuator}`,
            );
          }

          // Prevent duplicate actuator entries

          const key = `${item.esp32_id}:${item.actuator}`;

          if (seen.has(key)) {
            throw new BadRequestException(
              `Duplicate actuator in snapshot: ${key}`,
            );
          }

          seen.add(key);

          // STEP 3: Find ESP32 belonging to this BBB

          const esp32 = await espRepo.findOne({
            where: {
              bbb_id: Number(bbb.id),
              device_id: item.esp32_id,
            },
          });

          if (!esp32) {
            throw new BadRequestException(
              `ESP32 '${item.esp32_id}' does not belong to BBB '${bbb.device_id}'`,
            );
          }

          // STEP 4: Validate device scope and Zone

          let zoneId: number | null = null;

          if (esp32.scope === 'zone') {
            if (
              esp32.zone_id === null ||
              esp32.zone_id === undefined
            ) {
              throw new BadRequestException(
                `Zone-level ESP32 '${item.esp32_id}' has no assigned zone`,
              );
            }

            const zone = await zoneRepo.findOne({
              where: {
                id: Number(esp32.zone_id),
                farm_id: Number(bbb.farm_id),
              },
            });

            if (!zone) {
              throw new BadRequestException(
                `Invalid Zone assignment for ESP32 '${item.esp32_id}'`,
              );
            }

            zoneId = Number(zone.id);
          } else if (esp32.scope === 'farm') {
            if (
              esp32.zone_id !== null &&
              esp32.zone_id !== undefined
            ) {
              throw new BadRequestException(
                `Farm-level ESP32 '${item.esp32_id}' must not have a zone`,
              );
            }
          } else {
            throw new BadRequestException(
              `Invalid scope '${esp32.scope}' for ESP32 '${item.esp32_id}'`,
            );
          }

          // STEP 5: Find actuator belonging to this ESP32

          const actuator = await actuatorRepo.findOne({
            where: {
              esp32_id: esp32.id,
              name: item.actuator,
            },
          });

          if (!actuator) {
            throw new BadRequestException(
              `Actuator '${item.actuator}' does not belong to ESP32 '${item.esp32_id}'`,
            );
          }

          // STEP 6: Update current actuator state

          actuator.reported_control_mode = item.mode;

          // Preserve existing desired_state if BBB reports null.

          if (item.desired_state !== null) {
            actuator.desired_state =
              item.desired_state === 1;
          }

          // Preserve existing actual_state if BBB reports UNKNOWN.

          if (item.actual_state !== null) {
            actuator.actual_state =
              item.actual_state === 1;

            actuator.state_updated_at =
              new Date(item.timestamp);
          }

          await actuatorRepo.save(actuator);

          // STEP 7: Build response

          results.push({
            actuator_id: actuator.id,
            esp32_id: esp32.device_id,
            zone_id: zoneId,
            actuator: actuator.name,
            control_mode: item.mode,
            desired_state: item.desired_state,
            actual_state: item.actual_state,
            reason: item.reason ?? null,
            timestamp: item.timestamp,
          });
        }

        return {
          action: 'ACTUATOR_STATES',
          request_id: snapshot.request_id,
          bbb_id: snapshot.bbb_id,
          actuators: results,
          timestamp: snapshot.timestamp,
        };
      },
    );
  }

  // =========================================
  // 5. GET LATEST TELEMETRY BY ZONE
  // =========================================

  async getLatestTelemetry(zoneId: string) {
    return this.influxService.getLatestTelemetry(zoneId);
  }

  // =========================================
  // 6. GET ACTUATOR STATES FROM DATABASE
  // =========================================

  async getActuatorStatesByFarm(farmId: number) {
    const actuators = await this.actuatorRepository
      .createQueryBuilder('actuator')
      .innerJoinAndSelect('actuator.esp32', 'esp32')
      .where(
        'esp32.bbb_id = (SELECT id FROM bbbs WHERE farm_id = :farmId)',
        { farmId },
      )
      .orderBy('esp32.id', 'ASC')
      .addOrderBy('actuator.id', 'ASC')
      .getMany();

    return actuators.map((actuator) => ({
      esp32_id: actuator.esp32.device_id,
      zone_id: actuator.esp32.zone_id ?? null,
      actuator: actuator.name,
      control_mode:
        actuator.reported_control_mode ??
        actuator.control_mode,
      desired_state: actuator.desired_state,
      actual_state: actuator.actual_state,
      state_updated_at: actuator.state_updated_at,
    }));
  }

  // =========================================
  // 7. GET ACTUATOR STATES BY USER
  // =========================================

  async getActuatorStatesByUser(userId: number) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException(
        'Invalid user information',
      );
    }

    const actuators = await this.actuatorRepository
      .createQueryBuilder('actuator')
      .innerJoinAndSelect('actuator.esp32', 'esp32')
      .innerJoinAndSelect('esp32.bbb', 'bbb')
      .innerJoinAndSelect('bbb.farm', 'farm')
      .where('farm.user_id = :userId', { userId })
      .orderBy('farm.id', 'ASC')
      .addOrderBy('esp32.id', 'ASC')
      .addOrderBy('actuator.id', 'ASC')
      .getMany();

    return {
      actuators: actuators.map((actuator) => ({
        actuator_id: actuator.id,

        farm_id: actuator.esp32.bbb.farm.id,
        farm_name: actuator.esp32.bbb.farm.name,

        bbb_id: actuator.esp32.bbb.device_id,

        esp32_id: actuator.esp32.device_id,
        scope: actuator.esp32.scope,
        zone_id: actuator.esp32.zone_id ?? null,

        actuator: actuator.name,
        type: actuator.type,

        control_mode: actuator.control_mode,
        reported_control_mode:
          actuator.reported_control_mode,

        desired_state: actuator.desired_state,
        actual_state: actuator.actual_state,

        state_updated_at: actuator.state_updated_at,
      })),
    };
  }

  // =========================================
  // 8. RECORD ACTUATOR COMMAND
  // =========================================

  
async recordActuatorCommand(
  esp32DeviceId: string,
  actuatorName: string,
  action: 'SET_STATE' | 'RETURN_TO_AUTO',
  mode: 'MANUAL' | 'AUTO',
  state?: number,
) {
  // STEP 1: Validate action and mode

  if (
    action === 'SET_STATE' &&
    mode !== 'MANUAL'
  ) {
    throw new BadRequestException(
      'SET_STATE chỉ được sử dụng với mode MANUAL',
    );
  }

  if (
    action === 'RETURN_TO_AUTO' &&
    mode !== 'AUTO'
  ) {
    throw new BadRequestException(
      'RETURN_TO_AUTO chỉ được sử dụng với mode AUTO',
    );
  }

  if (
    action === 'SET_STATE' &&
    state !== 0 &&
    state !== 1
  ) {
    throw new BadRequestException(
      'State chỉ được phép là 0 hoặc 1',
    );
  }

  if (
    action === 'RETURN_TO_AUTO' &&
    state !== undefined
  ) {
    throw new BadRequestException(
      'RETURN_TO_AUTO không được chứa state',
    );
  }

  // STEP 2: Use transaction

  return this.actuatorRepository.manager.transaction(
    async (manager) => {
      const espRepo =
        manager.getRepository(Esp32Device);

      const actuatorRepo =
        manager.getRepository(Actuator);

      const logRepo =
        manager.getRepository(ActuatorLog);

      // STEP 3: Find ESP32

      const esp32 = await espRepo.findOne({
        where: {
          device_id: esp32DeviceId,
        },
      });

      if (!esp32) {
        throw new BadRequestException(
          `Không tìm thấy ESP32 '${esp32DeviceId}'`,
        );
      }

      // STEP 4: Find actuator

      const actuator = await actuatorRepo.findOne({
        where: {
          esp32_id: esp32.id,
          name: actuatorName,
        },
      });

      if (!actuator) {
        throw new BadRequestException(
          `Không tìm thấy actuator '${actuatorName}'`,
        );
      }

      // STEP 5: Update desired state only for MANUAL

      let commandedState: boolean | null = null;

      if (action === 'SET_STATE') {
        commandedState = state === 1;

        actuator.desired_state = commandedState;
      }

      // Update requested control mode.
      // reported_control_mode is updated only
      // when BBB reports its actual mode.

      actuator.control_mode = mode.toLowerCase();

      await actuatorRepo.save(actuator);

      // STEP 6: Create USER history log

      const log = logRepo.create({
        actuator_id: actuator.id,
        actuator_name: actuator.name,

        control_mode: mode.toLowerCase(),

        commanded_state: commandedState,

        actual_state: null,

        source: 'USER',

        created_at: new Date(),
      });

      const savedLog = await logRepo.save(log);

      // STEP 7: Return command information

      return {
        command_id: savedLog.id,

        esp32_id: esp32.device_id,

        actuator: actuator.name,

        action,

        mode,

        commanded_state: commandedState,

        message:
          action === 'SET_STATE'
            ? 'Đã ghi nhận lệnh MANUAL'
            : 'Đã ghi nhận yêu cầu chuyển AUTO',
      };
    },
  );
}


  // =========================================
  // 9. GET ACTUATOR HISTORY BY USER
  // =========================================

  async getActuatorHistoryByUser(
    userId: number,
    filters: {
      farm_id?: string;
      zone_id?: string;
      esp32_id?: string;
      actuator?: string;
      source?: string;
      from?: string;
      to?: string;
      page?: string;
      limit?: string;
    },
  ) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException(
        'Invalid user information',
      );
    }

    // STEP 1: Validate pagination

    const page = filters.page
      ? Number(filters.page)
      : 1;

    const limit = filters.limit
      ? Number(filters.limit)
      : 20;

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new BadRequestException(
        'page phải >= 1 và limit phải từ 1 đến 100',
      );
    }

    // STEP 2: Validate date filters

    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (filters.from) {
      fromDate = new Date(filters.from);

      if (Number.isNaN(fromDate.getTime())) {
        throw new BadRequestException(
          'Thời gian from không hợp lệ',
        );
      }
    }

    if (filters.to) {
      toDate = new Date(filters.to);

      if (Number.isNaN(toDate.getTime())) {
        throw new BadRequestException(
          'Thời gian to không hợp lệ',
        );
      }
    }

    if (
      fromDate &&
      toDate &&
      fromDate.getTime() > toDate.getTime()
    ) {
      throw new BadRequestException(
        'from không được lớn hơn to',
      );
    }

    // STEP 3: Validate source

    if (
      filters.source &&
      !['USER', 'DEVICE'].includes(
        filters.source.toUpperCase(),
      )
    ) {
      throw new BadRequestException(
        'source chỉ được phép là USER hoặc DEVICE',
      );
    }

    // STEP 4: Build query

    const query = this.actuatorLogRepository
      .createQueryBuilder('log')
      .innerJoinAndSelect('log.actuator', 'actuator')
      .innerJoinAndSelect('actuator.esp32', 'esp32')
      .innerJoinAndSelect('esp32.bbb', 'bbb')
      .innerJoinAndSelect('bbb.farm', 'farm')
      .where('farm.user_id = :userId', {
        userId,
      });

    // STEP 5: Apply filters

    if (filters.farm_id) {
      const farmId = Number(filters.farm_id);

      if (!Number.isInteger(farmId) || farmId <= 0) {
        throw new BadRequestException(
          'farm_id không hợp lệ',
        );
      }

      query.andWhere('farm.id = :farmId', {
        farmId,
      });
    }

    if (filters.zone_id) {
      const zoneId = Number(filters.zone_id);

      if (!Number.isInteger(zoneId) || zoneId <= 0) {
        throw new BadRequestException(
          'zone_id không hợp lệ',
        );
      }

      query.andWhere('esp32.zone_id = :zoneId', {
        zoneId,
      });
    }

    if (filters.esp32_id) {
      query.andWhere(
        'esp32.device_id = :esp32Id',
        {
          esp32Id: filters.esp32_id,
        },
      );
    }

    if (filters.actuator) {
      query.andWhere(
        'actuator.name = :actuatorName',
        {
          actuatorName: filters.actuator,
        },
      );
    }

    if (filters.source) {
      query.andWhere(
        'log.source = :source',
        {
          source: filters.source.toUpperCase(),
        },
      );
    }

    if (fromDate) {
      query.andWhere(
        'log.created_at >= :fromDate',
        { fromDate },
      );
    }

    if (toDate) {
      query.andWhere(
        'log.created_at <= :toDate',
        { toDate },
      );
    }

    // STEP 6: Pagination and sorting

    query
      .orderBy('log.created_at', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [logs, total] =
      await query.getManyAndCount();

    // STEP 7: Format response

    return {
      items: logs
        .filter(
          (log) =>
            log.actuator !== null &&
            log.actuator !== undefined,
        )
        .map((log) => ({
          id: log.id,

          farm_id: log.actuator!.esp32.bbb.farm.id,
          farm_name: log.actuator!.esp32.bbb.farm.name,

          bbb_id: log.actuator!.esp32.bbb.device_id,

          esp32_id: log.actuator!.esp32.device_id,
          scope: log.actuator!.esp32.scope,
          zone_id:
            log.actuator!.esp32.zone_id ?? null,

          actuator_id: log.actuator!.id,
          actuator: log.actuator_name,

          control_mode: log.control_mode,

          commanded_state: log.commanded_state,
          actual_state: log.actual_state,

          source: log.source,
          created_at: log.created_at,
        })),

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
