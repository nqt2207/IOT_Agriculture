
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import mqtt, { MqttClient } from 'mqtt';

import { randomUUID } from 'crypto';

import { BbbService } from './bbb.service';
import { TelemetryDto } from './dtos/telemetry.dto';
import { ActuatorStateDto } from './dtos/actuatorState.dto';
import { TelemetryGateway } from './telemetry.gateway';

interface ActuatorSnapshotItem {
  esp32_id: string;
  actuator: string;
  mode: string;
  desired_state: number | null;
  actual_state: number | null;
  reason?: string | null;
  timestamp: string;
}

interface ActuatorSnapshot {
  action: string;
  request_id: string;
  bbb_id: string;
  actuators: ActuatorSnapshotItem[];
  timestamp: string;
}

interface PendingSyncRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  createdAt: number;
}

@Injectable()
export class MqttTelemetryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    MqttTelemetryService.name,
  );

  private client: MqttClient | undefined;

  private isConnected = false;

  // MQTT topics
  private readonly commandTopic =
    'iot/BBB_01/command';

  private readonly actuatorStateTopic =
    'iot/BBB_01/actuator_state';

  private readonly syncTimeoutMs = 10_000;

  // Các request đồng bộ đang chờ BBB phản hồi.
  private readonly pendingSyncRequests = new Map<
    string,
    PendingSyncRequest
  >();

  // Trạng thái actuator gần nhất trong RAM.
  private actuatorState: Record<string, unknown> = {
    device_id: 'BBB_01',
    actuators: {},
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly bbbService: BbbService,
    private readonly telemetryGateway: TelemetryGateway,
  ) {}

  // =====================================================
  // 1. INITIALIZE MQTT
  // =====================================================

  onModuleInit(): void {
    const brokerUrl =
      this.configService.get<string>(
        'MQTT_BROKER_URL',
      );

    const username =
      this.configService.get<string>(
        'MQTT_USERNAME',
      );

    const password =
      this.configService.get<string>(
        'MQTT_PASSWORD',
      );

    const telemetryTopic =
      this.configService.get<string>(
        'MQTT_TELEMETRY_TOPIC',
      );

    if (
      !brokerUrl ||
      !username ||
      !password ||
      !telemetryTopic
    ) {
      this.logger.error(
        'Thiếu cấu hình MQTT. Kiểm tra các biến môi trường.',
      );
      return;
    }

    this.logger.log(
      `Đang kết nối MQTT broker: ${brokerUrl}`,
    );

    this.client = mqtt.connect(brokerUrl, {
      username,
      password,
      clientId: `iot-backend-${Math.random()
        .toString(16)
        .slice(2, 10)}`,
      clean: true,
      connectTimeout: 30_000,
      reconnectPeriod: 5_000,
    });

    this.client.on('connect', () => {
      this.isConnected = true;

      this.logger.log(
        'Đã kết nối EMQX Cloud',
      );

      const topics = [
        telemetryTopic,
        this.actuatorStateTopic,
      ];

      this.client?.subscribe(
        topics,
        { qos: 1 },
        (error, granted) => {
          if (error) {
            this.logger.error(
              `Subscribe topic thất bại: ${error.message}`,
            );
            return;
          }

          this.logger.log(
            `Đã subscribe MQTT: ${JSON.stringify(granted)}`,
          );
        },
      );
    });

    this.client.on('reconnect', () => {
      this.logger.warn(
        'Đang thử kết nối lại EMQX Cloud...',
      );
    });

    this.client.on('close', () => {
      this.isConnected = false;

      this.rejectAllPendingSyncRequests(
        'MQTT connection closed',
      );
    });

    this.client.on('offline', () => {
      this.isConnected = false;

      this.rejectAllPendingSyncRequests(
        'MQTT connection offline',
      );
    });

    this.client.on('error', (error) => {
      this.logger.error(
        `MQTT error: ${error.message}`,
      );
    });

    this.client.on(
      'message',
      (receivedTopic, message) => {
        const rawMessage = message.toString();

        if (
          receivedTopic ===
          this.actuatorStateTopic
        ) {
          void this.handleActuatorState(
            receivedTopic,
            rawMessage,
          );

          return;
        }

        void this.handleMessage(
          receivedTopic,
          rawMessage,
          telemetryTopic,
        );
      },
    );
  }

  // =====================================================
  // 2. HANDLE TELEMETRY FROM BBB
  // =====================================================

  private async handleMessage(
    topic: string,
    rawMessage: string,
    telemetryTopic: string,
  ): Promise<void> {
    try {
      if (topic !== telemetryTopic) {
        this.logger.warn(
          `Bỏ qua topic không được hỗ trợ: ${topic}`,
        );
        return;
      }

      const parts = topic.split('/');

      if (
        parts.length !== 3 ||
        parts[0] !== 'iot' ||
        parts[2] !== 'telemetry'
      ) {
        this.logger.warn(
          `Topic telemetry không hợp lệ: ${topic}`,
        );
        return;
      }

      const bbbDeviceId = parts[1];

      const payload: unknown =
        JSON.parse(rawMessage);

      const dto = plainToInstance(
        TelemetryDto,
        payload,
      );

      const errors = await validate(dto);

      if (errors.length > 0) {
        this.logger.warn(
          `Telemetry không hợp lệ: ${JSON.stringify(errors)}`,
        );
        return;
      }

      const bbb =
        await this.bbbService.findByDeviceId(
          bbbDeviceId,
        );

      if (!bbb) {
        this.logger.warn(
          `Không tìm thấy BBB: ${bbbDeviceId}`,
        );
        return;
      }

      const result =
        await this.bbbService.receiveTelemetry(
          bbb,
          dto,
        );

      this.telemetryGateway.emitTelemetryUpdate({
        bbbId: bbbDeviceId,
        zoneId: result.zone_id,
        esp32Id: dto.esp32_id,
        timestamp: dto.timestamp,
        sensors: dto.sensors,
      });

      // Node3 tank status:
      // 1 = AVAILABLE
      // 0 = EMPTY

      if (
        dto.esp32_id === 'ESP32_NODE3' &&
        result.scope === 'farm' &&
        result.zone_id == null &&
        (
          dto.sensors.tank_status === 0 ||
          dto.sensors.tank_status === 1
        )
      ) {
        this.telemetryGateway.emitTankStatusUpdate({
          bbbId: bbbDeviceId,
          farmId: bbb.farm_id,
          esp32Id: dto.esp32_id,

          tank_status: dto.sensors.tank_status,

          status:
            dto.sensors.tank_status === 0
              ? 'EMPTY'
              : 'AVAILABLE',

          timestamp: dto.timestamp,
        });

        this.logger.log(
          `Cập nhật tank status: Farm ${bbb.farm_id} - ${
            dto.sensors.tank_status === 0
              ? 'AVAILABLE'
              : 'EMPTY'
          }`,
        );
      }

      this.logger.log(
        `Đã xử lý telemetry: ${JSON.stringify(result)}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.logger.error(
        `Xử lý telemetry thất bại: ${message}`,
      );
    }
  }

  // =====================================================
  // 3. PUBLISH ACTUATOR COMMAND
  // =====================================================

  
  async publishActuatorCommand(
    esp32Id: string,
    actuator: string,
    action: 'SET_STATE' | 'RETURN_TO_AUTO',
    mode: 'MANUAL' | 'AUTO',
    value?: number,
  ): Promise<Record<string, unknown>> {
    // STEP 1: Validate input

    if (!esp32Id || !esp32Id.trim()) {
      throw new BadRequestException(
        'esp32_id không được để trống.',
      );
    }

    if (!actuator || !actuator.trim()) {
      throw new BadRequestException(
        'actuator không được để trống.',
      );
    }

    if (
      action === 'SET_STATE' &&
      mode !== 'MANUAL'
    ) {
      throw new BadRequestException(
        'SET_STATE yêu cầu mode MANUAL.',
      );
    }

    if (
      action === 'RETURN_TO_AUTO' &&
      mode !== 'AUTO'
    ) {
      throw new BadRequestException(
        'RETURN_TO_AUTO yêu cầu mode AUTO.',
      );
    }

    if (
      action === 'SET_STATE' &&
      value !== 0 &&
      value !== 1
    ) {
      throw new BadRequestException(
        'State chỉ được phép là 0 hoặc 1.',
      );
    }

    if (
      action === 'RETURN_TO_AUTO' &&
      value !== undefined
    ) {
      throw new BadRequestException(
        'RETURN_TO_AUTO không được chứa state.',
      );
    }

    // STEP 2: Check MQTT connection

    const mqttClient = this.client;

    if (!mqttClient || !this.isConnected) {
      throw new ServiceUnavailableException(
        'Backend chưa kết nối EMQX Cloud.',
      );
    }

    // STEP 3: Record command and get command_id

    const command =
      await this.bbbService.recordActuatorCommand(
        esp32Id,
        actuator,
        action,
        mode,
        value,
      );

    // STEP 4: Build MQTT payload

    const payload: Record<string, unknown> = {
      esp32_id: esp32Id,
      actuator,
      action,
      mode,
      command_id: command.command_id,
      timestamp: new Date().toISOString(),
    };

    // Only MANUAL SET_STATE contains state.
    if (action === 'SET_STATE') {
      payload.state = value;
    }

    const message = JSON.stringify(payload);

    // STEP 5: Publish MQTT

    return new Promise((resolve, reject) => {
      try {
        mqttClient.publish(
          this.commandTopic,
          message,
          {
            qos: 1,
            retain: false,
          },
          (error) => {
            if (error) {
              this.logger.error(
                `Publish lệnh thất bại: ${error.message}. command_id=${command.command_id}`,
              );

              reject(
                new ServiceUnavailableException(
                  'Không thể publish lệnh lên MQTT.',
                ),
              );

              return;
            }

            this.logger.log(
              `Đã publish actuator command: ${message}`,
            );

            resolve({
              device_id: 'BBB_01',

              topic: this.commandTopic,

              ...payload,

              message:
                action === 'SET_STATE'
                  ? 'Lệnh MANUAL đã được publish lên MQTT. Đang chờ phản hồi từ ESP32.'
                  : 'Yêu cầu chuyển AUTO đã được publish lên MQTT. Đang chờ BBB xử lý.',
            });
          },
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : String(error);

        this.logger.error(
          `Publish MQTT exception: ${errorMessage}`,
        );

        reject(
          new ServiceUnavailableException(
            'Có lỗi khi gửi lệnh điều khiển qua MQTT.',
          ),
        );
      }
    });
  }


  // =====================================================
  // 4. REQUEST ACTUATOR SNAPSHOT FROM BBB
  // =====================================================

  async requestActuatorSync(
    bbbId: string,
  ): Promise<Record<string, unknown>> {
    if (bbbId !== 'BBB_01') {
      throw new BadRequestException(
        `BBB '${bbbId}' chưa được cấu hình MQTT sync.`,
      );
    }

    const mqttClient = this.client;

    if (!mqttClient || !this.isConnected) {
      throw new ServiceUnavailableException(
        'Backend chưa kết nối EMQX Cloud. Không thể đồng bộ actuator.',
      );
    }

    const requestId = randomUUID();

    const payload = {
      action: 'GET_ACTUATOR_STATES',
      request_id: requestId,
      bbb_id: bbbId,
    };

    const message = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingSyncRequests.delete(requestId);

        this.logger.warn(
          `Actuator sync timeout: BBB=${bbbId}, request_id=${requestId}`,
        );

        reject(
          new ServiceUnavailableException(
            'BBB không phản hồi yêu cầu đồng bộ actuator trong thời gian quy định.',
          ),
        );
      }, this.syncTimeoutMs);

      this.pendingSyncRequests.set(
        requestId,
        {
          resolve,
          reject,
          timeout,
          createdAt: Date.now(),
        },
      );

      mqttClient.publish(
        this.commandTopic,
        message,
        { qos: 1, retain: false },
        (error) => {
          if (error) {
            const pending =
              this.pendingSyncRequests.get(
                requestId,
              );

            if (pending) {
              clearTimeout(pending.timeout);

              this.pendingSyncRequests.delete(
                requestId,
              );

              reject(
                new ServiceUnavailableException(
                  `Không thể gửi yêu cầu đồng bộ actuator: ${error.message}`,
                ),
              );
            }

            return;
          }

          this.logger.log(
            `Đã gửi actuator sync request: ${message}`,
          );
        },
      );
    });
  }

  // =====================================================
  // 5. HANDLE ACTUATOR STATE FROM BBB / ESP32
  // =====================================================

  private async handleActuatorState(
    topic: string,
    rawMessage: string,
  ): Promise<void> {
    try {
      const parts = topic.split('/');

      if (
        parts.length !== 3 ||
        parts[0] !== 'iot' ||
        parts[2] !== 'actuator_state'
      ) {
        this.logger.warn(
          `Actuator state topic không hợp lệ: ${topic}`,
        );
        return;
      }

      const bbbDeviceId = parts[1];

      const payload: unknown =
        JSON.parse(rawMessage);

      if (
        !payload ||
        typeof payload !== 'object'
      ) {
        this.logger.warn(
          'Actuator state payload không phải object.',
        );
        return;
      }

      const data = payload as Record<
        string,
        unknown
      >;

      // Snapshot response phải được xử lý trước
      // khi validate ActuatorStateDto.
      if (
        data.action === 'ACTUATOR_STATES'
      ) {
        await this.handleActuatorSnapshot(
          bbbDeviceId,
          data,
        );

        return;
      }

      // =========================================
      // NORMAL ESP32 ACTUATOR FEEDBACK
      // =========================================

      const dto = plainToInstance(
        ActuatorStateDto,
        payload,
      );

      const errors = await validate(dto);

      if (errors.length > 0) {
        this.logger.warn(
          `Actuator state không hợp lệ: ${JSON.stringify(errors)}`,
        );
        return;
      }

      const bbb =
        await this.bbbService.findByDeviceId(
          bbbDeviceId,
        );

      if (!bbb) {
        this.logger.warn(
          `Không tìm thấy BBB: ${bbbDeviceId}`,
        );
        return;
      }

      const result =
        await this.bbbService.receiveActuatorState(
          bbb,
          dto,
        );

      const actuatorKey =
        `${dto.esp32_id}:${dto.actuator}`;

      const currentActuators =
        this.actuatorState.actuators as Record<
          string,
          unknown
        >;

      currentActuators[actuatorKey] = {
        esp32_id: dto.esp32_id,
        actuator: dto.actuator,
        value: dto.value,
        timestamp: dto.timestamp,
      };

      this.actuatorState = {
        device_id: bbbDeviceId,
        actuators: currentActuators,
      };

      this.telemetryGateway.emitActuatorState({
        ...result,
      });

      this.logger.log(
        `Đã cập nhật actuator state: ${JSON.stringify(result)}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.logger.error(
        `Xử lý actuator state thất bại: ${message}`,
      );
    }
  }

  // =====================================================
  // 6. HANDLE SNAPSHOT RESPONSE
  // =====================================================

  private async handleActuatorSnapshot(
    bbbDeviceId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const requestId = data.request_id;

    if (
      typeof requestId !== 'string' ||
      !requestId.trim()
    ) {
      this.logger.warn(
        'Snapshot không có request_id hợp lệ.',
      );
      return;
    }

    const pending =
      this.pendingSyncRequests.get(requestId);

    // Chỉ xử lý snapshot có request đang chờ.
    if (!pending) {
      this.logger.warn(
        `Bỏ qua snapshot không có request đang chờ: ${requestId}`,
      );
      return;
    }

    try {
      if (
        data.bbb_id !== bbbDeviceId ||
        data.bbb_id !== 'BBB_01'
      ) {
        throw new BadRequestException(
          'Snapshot BBB ID mismatch',
        );
      }

      if (
        !Array.isArray(data.actuators) ||
        data.actuators.length === 0
      ) {
        throw new BadRequestException(
          'Snapshot không có danh sách actuator hợp lệ.',
        );
      }

      if (
        typeof data.timestamp !== 'string' ||
        Number.isNaN(
          new Date(data.timestamp).getTime(),
        )
      ) {
        throw new BadRequestException(
          'Snapshot timestamp không hợp lệ.',
        );
      }

      const snapshot =
        data as unknown as ActuatorSnapshot;

      // Kiểm tra toàn bộ item trước khi ghi DB.
      for (const item of snapshot.actuators) {
        if (
          !item ||
          typeof item.esp32_id !== 'string' ||
          typeof item.actuator !== 'string' ||
          !['AUTO', 'MANUAL'].includes(
            String(item.mode).toUpperCase(),
          ) ||
          ![0, 1, null].includes(
            item.desired_state,
          ) ||
          ![0, 1, null].includes(
            item.actual_state,
          ) ||
          typeof item.timestamp !== 'string' ||
          Number.isNaN(
            new Date(item.timestamp).getTime(),
          )
        ) {
          throw new BadRequestException(
            'Snapshot chứa actuator data không hợp lệ.',
          );
        }
      }

      const bbb =
        await this.bbbService.findByDeviceId(
          bbbDeviceId,
        );

      if (!bbb) {
        throw new BadRequestException(
          `Không tìm thấy BBB: ${bbbDeviceId}`,
        );
      }

      // Cập nhật PostgreSQL.
      // Nếu lỗi, không resolve request.
      const result =
        await this.bbbService.receiveActuatorSnapshot(
          bbb,
          snapshot,
        );

      // Cập nhật in-memory state sau khi DB thành công.
      const currentActuators: Record<
        string,
        unknown
      > = {};

      for (const item of result.actuators as Array<
        Record<string, unknown>
      >) {
        const key =
          `${item.esp32_id}:${item.actuator}`;

        currentActuators[key] = {
          esp32_id: item.esp32_id,
          actuator: item.actuator,
          mode: item.control_mode,
          desired_state: item.desired_state,
          actual_state: item.actual_state,
          reason: item.reason,
          timestamp: item.timestamp,
        };
      }

      this.actuatorState = {
        device_id: bbbDeviceId,
        actuators: currentActuators,
        timestamp: result.timestamp,
      };

      // Phát WebSocket cho frontend.
      for (const item of result.actuators) {
        this.telemetryGateway.emitActuatorState({
          ...item,
          device_id: bbbDeviceId,
          source: 'SNAPSHOT',
        });
      }

      this.logger.log(
        `Actuator snapshot synchronized successfully: ${JSON.stringify({
          bbb_id: bbbDeviceId,
          request_id: requestId,
          count: result.actuators.length,
        })}`,
      );

      // Resolve sau khi DB đã lưu thành công.
      clearTimeout(pending.timeout);

      this.pendingSyncRequests.delete(
        requestId,
      );

      pending.resolve(
        result as unknown as Record<
          string,
          unknown
        >,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.logger.error(
        `Xử lý actuator snapshot thất bại: ${message}`,
      );

      clearTimeout(pending.timeout);

      this.pendingSyncRequests.delete(
        requestId,
      );

      pending.reject(
        new ServiceUnavailableException(
          `Không thể đồng bộ trạng thái actuator: ${message}`,
        ),
      );
    }
  }

  // =====================================================
  // 7. GET ACTUATOR STATE
  // =====================================================

  getActuatorState(): Record<string, unknown> {
    return this.actuatorState;
  }

  // =====================================================
  // 8. REJECT PENDING REQUESTS
  // =====================================================

  private rejectAllPendingSyncRequests(
    reason: string,
  ): void {
    for (
      const [
        requestId,
        pending,
      ] of this.pendingSyncRequests
    ) {
      clearTimeout(pending.timeout);

      pending.reject(
        new ServiceUnavailableException(
          `Không thể đồng bộ actuator: ${reason}`,
        ),
      );

      this.pendingSyncRequests.delete(
        requestId,
      );
    }
  }

  // =====================================================
  // 9. DESTROY MQTT
  // =====================================================

  onModuleDestroy(): void {
    this.isConnected = false;

    this.rejectAllPendingSyncRequests(
      'Backend MQTT service is shutting down',
    );

    if (this.client) {
      this.client.end(true);

      this.logger.log(
        'Đã đóng kết nối MQTT.',
      );
    }
  }
}
