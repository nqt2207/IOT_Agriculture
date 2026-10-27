
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
import { TelemetryGateway } from './telemetry.gateway';

@Injectable()
export class MqttTelemetryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MqttTelemetryService.name);

  private client: MqttClient | undefined;
  private isConnected = false;

  // MQTT topics
  private readonly commandTopic = 'iot/BBB_01/command';

  private readonly actuatorStateTopic =
    'iot/BBB_01/actuator_state';

  private readonly allowedActuators = [
    'pump1',
    'fan',
    'light',
  ] as const;

  // Trạng thái mô phỏng gần nhất nhận được từ BBB
  private actuatorState: Record<string, unknown> = {
    device_id: 'BBB_01',
    simulation: true,
    actuators: {
      pump1: 0,
      fan: 0,
      light: 0,
    },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly bbbService: BbbService,
    private readonly telemetryGateway: TelemetryGateway,
  ) {}

  // =====================================================
  // INITIALIZE MQTT
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
        'Thiếu cấu hình MQTT. Kiểm tra các biến môi trường trên Render.',
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
            `Đã subscribe các topic MQTT: ${JSON.stringify(granted)}`,
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
          this.handleActuatorState(rawMessage);
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
  // HANDLE TELEMETRY
  // =====================================================

  private async handleMessage(
    topic: string,
    rawMessage: string,
    telemetryTopic: string,
  ): Promise<void> {
    try {
      // Chỉ xử lý topic telemetry đã cấu hình.
      if (topic !== telemetryTopic) {
        this.logger.warn(
          `Bỏ qua topic không được hỗ trợ: ${topic}`,
        );
        return;
      }

      const parts = topic.split('/');

      // Topic có dạng: iot/BBB_01/telemetry
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
          `Không tìm thấy BBB có device_id=${bbbDeviceId}`,
        );
        return;
      }

      const result =
        await this.bbbService.receiveTelemetry(
          bbb,
          dto,
        );

      // Phát telemetry sau khi xử lý thành công.
      this.telemetryGateway.emitTelemetryUpdate({
        bbbId: bbbDeviceId,
        zoneId: dto.zone_id,
        esp32Id: dto.esp32_id,
        timestamp: dto.timestamp,
        sensors: dto.sensors,
      });

      this.logger.log(
        `Đã xử lý telemetry từ ${bbbDeviceId}: ${JSON.stringify(result)}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.logger.error(
        `Xử lý MQTT telemetry thất bại: ${message}`,
      );
    }
  }

  // =====================================================
  // PUBLISH ACTUATOR COMMAND
  // =====================================================

  async publishActuatorCommand(
    actuator: string,
    value: number,
  ): Promise<Record<string, unknown>> {
    if (
      !this.allowedActuators.includes(
        actuator as (typeof this.allowedActuators)[number],
      )
    ) {
      throw new BadRequestException(
        `Thiết bị không hợp lệ: ${actuator}`,
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

    const payload = JSON.stringify({
      [actuator]: value,
    });

    return new Promise((resolve, reject) => {
      this.client!.publish(
        this.commandTopic,
        payload,
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
            `Đã publish lệnh lên ${this.commandTopic}: ${payload}`,
          );

          resolve({
            device_id: 'BBB_01',
            topic: this.commandTopic,
            actuator,
            command: value,
            message:
              'Lệnh đã được publish lên EMQX Cloud.',
          });
        },
      );
    });
  }

  // =====================================================
  // GET ACTUATOR STATE
  // =====================================================

  getActuatorState(): Record<string, unknown> {
    return this.actuatorState;
  }

  // =====================================================
  // HANDLE ACTUATOR STATE FROM BBB
  // =====================================================

  private handleActuatorState(rawMessage: string): void {
    try {
      const data: unknown = JSON.parse(rawMessage);

      if (
        typeof data !== 'object' ||
        data === null ||
        Array.isArray(data)
      ) {
        this.logger.warn(
          'Bỏ qua actuator state không đúng định dạng JSON object.',
        );
        return;
      }

      const payload = data as Record<string, unknown>;

      // Hỗ trợ cả hai định dạng:
      // 1. {"pump1": 1, "pump2": 0, "fan": 0, "light": 0}
      // 2. {"device_id": "BBB_01", "simulation": true,
      //     "actuators": {"pump1": 1, "pump2": 0, "fan": 0, "light": 0}}
      const actuators =
        typeof payload.actuators === 'object' &&
        payload.actuators !== null &&
        !Array.isArray(payload.actuators)
          ? (payload.actuators as Record<string, unknown>)
          : payload;

      const validActuators = [
        'pump1',
        'fan',
        'light',
      ] as const;

      const normalizedActuators: Record<string, number> = {};

      for (const actuator of validActuators) {
        const value = actuators[actuator];

        if (value !== 0 && value !== 1) {
          this.logger.warn(
            `Trạng thái ${actuator} không hợp lệ: ${String(value)}`,
          );
          return;
        }

        normalizedActuators[actuator] = value;
      }

      this.actuatorState = {
        device_id: payload.device_id ?? 'BBB_01',
        simulation: payload.simulation ?? true,
        actuators: normalizedActuators,
      };

      this.logger.log(
        `Nhận trạng thái thiết bị từ BBB: ${JSON.stringify(this.actuatorState)}`,
      );

      this.telemetryGateway.emitActuatorState(this.actuatorState);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Không thể xử lý actuator state: ${message}`,
      );
    }
  }

  // =====================================================
  // DESTROY
  // =====================================================

  onModuleDestroy(): void {
    this.isConnected = false;

    if (this.client) {
      this.client.end(true);
      this.logger.log('Đã đóng kết nối MQTT');
    }
  }
}
