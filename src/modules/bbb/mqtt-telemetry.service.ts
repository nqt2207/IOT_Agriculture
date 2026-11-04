
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

import { BbbService } from './bbb.service';
import { TelemetryDto } from './dtos/telemetry.dto';
import { ActuatorStateDto } from './dtos/actuatorState.dto';
import { TelemetryGateway } from './telemetry.gateway';

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
  private readonly commandTopic = 'iot/BBB_01/command';

  private readonly actuatorStateTopic =
    'iot/BBB_01/actuator_state';

  // Trạng thái gần nhất của các actuator
  // Key có dạng: ESP32_NODE1:pump1
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
      this.configService.get<string>('MQTT_BROKER_URL');

    const username =
      this.configService.get<string>('MQTT_USERNAME');

    const password =
      this.configService.get<string>('MQTT_PASSWORD');

    const telemetryTopic =
      this.configService.get<string>('MQTT_TELEMETRY_TOPIC');

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

      this.logger.log('Đã kết nối EMQX Cloud');

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
    });

    this.client.on('offline', () => {
      this.isConnected = false;
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
          receivedTopic === this.actuatorStateTopic
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

      // Format: iot/BBB_01/telemetry
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

      const payload: unknown = JSON.parse(rawMessage);

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
    value: number,
  ): Promise<Record<string, unknown>> {
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

    if (value !== 0 && value !== 1) {
      throw new BadRequestException(
        'Giá trị điều khiển chỉ được phép là 0 hoặc 1.',
      );
    }

    if (!this.client || !this.isConnected) {
      throw new ServiceUnavailableException(
        'Backend chưa kết nối EMQX Cloud.',
      );
    }

    const payload = {
      esp32_id: esp32Id,
      actuator,
      state: value,
      timestamp: new Date().toISOString(),
    };

    const message = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      this.client!.publish(
        this.commandTopic,
        message,
        { qos: 1 },
        (error) => {
          if (error) {
            this.logger.error(
              `Publish lệnh thất bại: ${error.message}`,
            );

            reject(
              new ServiceUnavailableException(
                'Không thể gửi lệnh điều khiển.',
              ),
            );

            return;
          }

          this.logger.log(
            `Đã publish lệnh: ${message}`,
          );

          resolve({
            device_id: 'BBB_01',
            topic: this.commandTopic,
            ...payload,
            message:
              'Lệnh đã được gửi tới MQTT broker.',
          });
        },
      );
    });
  }

  // =====================================================
  // 4. GET ACTUATOR STATE
  // =====================================================

  getActuatorState(): Record<string, unknown> {
    return this.actuatorState;
  }

  // =====================================================
  // 5. HANDLE ACTUATOR STATE FROM BBB
  // =====================================================

  private async handleActuatorState(
    topic: string,
    rawMessage: string,
  ): Promise<void> {
    try {
      // STEP 1: Validate topic
      const parts = topic.split('/');

      // Format: iot/BBB_01/actuator_state
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

      // STEP 2: Parse JSON
      const payload: unknown = JSON.parse(rawMessage);

      // STEP 3: Convert to DTO
      const dto = plainToInstance(
        ActuatorStateDto,
        payload,
      );

      // STEP 4: Validate DTO
      const errors = await validate(dto);

      if (errors.length > 0) {
        this.logger.warn(
          `Actuator state không hợp lệ: ${JSON.stringify(errors)}`,
        );
        return;
      }

      // STEP 5: Find BBB
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

      // STEP 6: Update PostgreSQL and InfluxDB
      const result =
        await this.bbbService.receiveActuatorState(
          bbb,
          dto,
        );

      // STEP 7: Update in-memory state
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

      // STEP 8: Emit WebSocket event
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
  // 6. DESTROY MQTT
  // =====================================================

  onModuleDestroy(): void {
    this.isConnected = false;

    if (this.client) {
      this.client.end(true);
      this.logger.log(
        'Đã đóng kết nối MQTT.',
      );
    }
  }
}
