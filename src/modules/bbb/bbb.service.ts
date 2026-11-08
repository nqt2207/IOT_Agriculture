
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

    // -----------------------------------------
    // STEP 1: Find ESP32 belonging to this BBB
    // -----------------------------------------

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

    // -----------------------------------------
    // STEP 2: Validate according to device scope
    // -----------------------------------------

    const hasZoneId =
      dto.zone_id !== undefined &&
      dto.zone_id !== null &&
      dto.zone_id !== '';

    let zoneId: string | null = null;

    // =========================================
    // CASE A: ZONE-LEVEL DEVICE
    // Node1 / Node2
    // =========================================

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

      // Check Zone belongs to the same Farm as BBB

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

      // Check ESP32 is assigned to this Zone

      if (Number(esp32.zone_id) !== parsedZoneId) {
        throw new BadRequestException(
          `ESP32 '${dto.esp32_id}' is not assigned to Zone '${dto.zone_id}'`,
        );
      }

      zoneId = String(parsedZoneId);
    }

    // =========================================
    // CASE B: FARM-LEVEL DEVICE
    // Node3
    // =========================================

    else if (esp32.scope === 'farm') {
      if (hasZoneId) {
        throw new BadRequestException(
          `Farm-level ESP32 '${dto.esp32_id}' must not contain zone_id`,
        );
      }

      // Farm-level ESP32 must not be assigned to a Zone

      if (esp32.zone_id !== null && esp32.zone_id !== undefined) {
        throw new BadRequestException(
          `Farm-level ESP32 '${dto.esp32_id}' must have zone_id = NULL`,
        );
      }

      zoneId = null;
    }

    // =========================================
    // CASE C: INVALID SCOPE
    // =========================================

    else {
      throw new BadRequestException(
        `Invalid scope '${esp32.scope}' for ESP32 '${dto.esp32_id}'`,
      );
    }

    // -----------------------------------------
    // STEP 3: Write telemetry to InfluxDB
    // -----------------------------------------

    await this.influxService.writeTelemetry(
      bbb.device_id,
      zoneId,
      dto.esp32_id,
      dto.timestamp,
      dto.sensors,
    );

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

    // STEP 1: Tìm ESP32 thuộc BBB

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

    // STEP 2: Kiểm tra scope và xác định Zone

    let zoneId: string | null = null;

    if (esp32.scope === 'zone') {
      if (!esp32.zone_id) {
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

    // STEP 3: Tìm actuator

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

    // STEP 4: Xác định trạng thái phản hồi

    const newState = dto.value === 1;
    const receivedAt = new Date();

    // STEP 5: Cập nhật actual_state hiện tại

    actuator.actual_state = newState;
    actuator.state_updated_at = receivedAt;

    await this.actuatorRepository.save(actuator);

    // STEP 6: Nếu có command_id, cập nhật đúng lịch sử USER

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
        // Không tìm thấy log tương ứng.
        // Không được cập nhật một log khác để thay thế.

        console.warn(
          `Không tìm thấy USER log cho command_id=${dto.command_id}, actuator=${dto.actuator}`,
        );
      } else if (
        commandLog.commanded_state !== newState
      ) {
        // Phản hồi không khớp với trạng thái đã yêu cầu.

        console.warn(
          `State mismatch: command_id=${dto.command_id}, commanded=${commandLog.commanded_state}, received=${newState}`,
        );
      } else if (
        commandLog.actual_state === null ||
        commandLog.actual_state === undefined
      ) {
        // Chỉ cập nhật khi log chưa có phản hồi.

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
        // Phản hồi trùng lặp: không ghi đè, không tạo log mới.

        console.log(
          `Bỏ qua ACK trùng lặp: command_id=${dto.command_id}`,
        );
      } else {
        // Bản ghi đã được xác nhận với trạng thái khác.
        // Không ghi đè kết quả đã xác nhận.

        console.warn(
          `Command đã có kết quả khác trước đó: command_id=${dto.command_id}`,
        );
      }
    }

    // STEP 7: Ghi trạng thái vào InfluxDB

    await this.influxService.writeActuatorState(
      bbb.device_id,
      dto.esp32_id,
      zoneId,
      dto.actuator,
      dto.value,
      receivedAt.toISOString(),
    );

    // STEP 8: Trả kết quả

    return {
      message: 'Actuator state received',
      device_id: bbb.device_id,
      esp32_id: dto.esp32_id,
      zone_id: zoneId,
      actuator: dto.actuator,
      value: dto.value,
      command_id: dto.command_id ?? null,
      timestamp: receivedAt.toISOString(),
    };
  }


  // =========================================
  // 4. GET LATEST TELEMETRY BY ZONE
  // =========================================

  async getLatestTelemetry(zoneId: string) {
    return this.influxService.getLatestTelemetry(zoneId);
  }

  // =========================================
  // 5. GET ACTUATOR STATES FROM DATABASE
  // =========================================

  async getActuatorStatesByFarm(farmId: number) {
    const actuators = await this.actuatorRepository
      .createQueryBuilder('actuator')
      .innerJoinAndSelect('actuator.esp32', 'esp32')
      .where('esp32.bbb_id = (SELECT id FROM bbbs WHERE farm_id = :farmId)', {
        farmId,
      })
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
  // 6. GET ACTUATOR STATES BY USER
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
  // 7. RECORD ACTUATOR COMMAND
  // =========================================

  
  async recordActuatorCommand(
    esp32DeviceId: string,
    actuatorName: string,
    state: number,
  ) {
    if (state !== 0 && state !== 1) {
      throw new BadRequestException(
        'State chỉ được phép là 0 hoặc 1',
      );
    }

    // STEP 1: Tìm ESP32

    const esp32 = await this.esp32Repository.findOne({
      where: {
        device_id: esp32DeviceId,
      },
    });

    if (!esp32) {
      throw new BadRequestException(
        `Không tìm thấy ESP32 '${esp32DeviceId}'`,
      );
    }

    // STEP 2: Tìm actuator thuộc ESP32

    const actuator = await this.actuatorRepository.findOne({
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

    // STEP 3: Xác định trạng thái được yêu cầu

    const commandedState = state === 1;

    // STEP 4: Cập nhật desired_state

    actuator.desired_state = commandedState;

    await this.actuatorRepository.save(actuator);

    // STEP 5: Tạo lịch sử MANUAL
    // actual_state = null vì ESP32 chưa xác nhận.

    const log = this.actuatorLogRepository.create({
      actuator_id: actuator.id,
      actuator_name: actuator.name,
      control_mode: 'manual',
      commanded_state: commandedState,
      actual_state: null,
      source: 'USER',
      created_at: new Date(),
    });

    const savedLog =
      await this.actuatorLogRepository.save(log);

    // STEP 6: Trả ID để MqttTelemetryService đưa vào MQTT.

    return {
      command_id: savedLog.id,
      actuator: actuator.name,
      commanded_state: commandedState,
      message: 'Đã ghi nhận lệnh điều khiển',
    };
  }


  
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

    // 1. Validate pagination
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

    // 2. Validate date filters
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

    // 3. Validate source
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

    // 4. Build query
    const query = this.actuatorLogRepository
      .createQueryBuilder('log')
      .innerJoinAndSelect(
        'log.actuator',
        'actuator',
      )
      .innerJoinAndSelect(
        'actuator.esp32',
        'esp32',
      )
      .innerJoinAndSelect(
        'esp32.bbb',
        'bbb',
      )
      .innerJoinAndSelect(
        'bbb.farm',
        'farm',
      )
      .where('farm.user_id = :userId', {
        userId,
      });

    // 5. Apply filters

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

    // 6. Pagination and sorting
    query
      .orderBy('log.created_at', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [logs, total] =
      await query.getManyAndCount();

    // 7. Format response
    
    // 7. Format response
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
