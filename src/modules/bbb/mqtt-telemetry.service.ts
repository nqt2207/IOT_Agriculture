import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import mqtt, { MqttClient } from 'mqtt';

import { BbbService } from './bbb.service';
import { TelemetryDto } from './dtos/telemetry.dto';

@Injectable()
export class MqttTelemetryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MqttTelemetryService.name);
  private client: MqttClient | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly bbbService: BbbService,
  ) {}

  onModuleInit() {
    const brokerUrl =
      this.configService.get<string>('MQTT_BROKER_URL');
    const username =
      this.configService.get<string>('MQTT_USERNAME');
    const password =
      this.configService.get<string>('MQTT_PASSWORD');
    const topic =
      this.configService.get<string>('MQTT_TELEMETRY_TOPIC');

    if (!brokerUrl || !username || !password || !topic) {
      this.logger.error(
        'Thiếu cấu hình MQTT. Kiểm tra các biến môi trường trên Render.',
      );
      return;
    }

    this.logger.log(`Đang kết nối MQTT broker: ${brokerUrl}`);

    this.client = mqtt.connect(brokerUrl, {
      username,
      password,
      clientId: `iot-backend-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      connectTimeout: 30_000,
      reconnectPeriod: 5_000,
    });

    this.client.on('connect', () => {
      this.logger.log('Đã kết nối EMQX Cloud');

      this.client?.subscribe(topic, { qos: 1 }, (error) => {
        if (error) {
          this.logger.error(
            `Subscribe topic thất bại: ${error.message}`,
          );
          return;
        }

        this.logger.log(`Đã subscribe topic: ${topic}`);
      });
    });

    this.client.on('reconnect', () => {
      this.logger.warn('Đang thử kết nối lại EMQX Cloud...');
    });

    this.client.on('error', (error) => {
      this.logger.error(`MQTT error: ${error.message}`);
    });

    this.client.on('message', (receivedTopic, message) => {
      void this.handleMessage(receivedTopic, message.toString());
    });
  }

  private async handleMessage(
    topic: string,
    rawMessage: string,
  ): Promise<void> {
    try {
      const parts = topic.split('/');

      // Topic có dạng: iot/BBB_01/telemetry
      if (
        parts.length !== 3 ||
        parts[0] !== 'iot' ||
        parts[2] !== 'telemetry'
      ) {
        this.logger.warn(`Bỏ qua topic không hợp lệ: ${topic}`);
        return;
      }

      const bbbDeviceId = parts[1];
      const payload: unknown = JSON.parse(rawMessage);

      const dto = plainToInstance(TelemetryDto, payload);
      const errors = await validate(dto);

      if (errors.length > 0) {
        this.logger.warn(
          `Telemetry không hợp lệ: ${JSON.stringify(errors)}`,
        );
        return;
      }

      const bbb = await this.bbbService.findByDeviceId(bbbDeviceId);

      if (!bbb) {
        this.logger.warn(
          `Không tìm thấy BBB có device_id=${bbbDeviceId}`,
        );
        return;
      }

      const result = await this.bbbService.receiveTelemetry(bbb, dto);

      this.logger.log(
        `Đã xử lý telemetry từ ${bbbDeviceId}: ${JSON.stringify(result)}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`Xử lý MQTT telemetry thất bại: ${message}`);
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.end(true);
      this.logger.log('Đã đóng kết nối MQTT');
    }
  }
}