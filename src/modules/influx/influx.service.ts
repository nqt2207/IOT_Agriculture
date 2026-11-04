import {
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  InfluxDB,
  Point,
  WriteApi,
  type QueryApi,
} from '@influxdata/influxdb-client';

import { SensorsDto } from '../bbb/dtos/telemetry.dto';

@Injectable()
export class InfluxService implements OnModuleDestroy {
  private readonly writeApi: WriteApi;
  private readonly queryApi: QueryApi;

  constructor(
    private readonly configService: ConfigService,
  ) {
    const influxConfig = this.configService.get('influx');

    if (
      !influxConfig?.url ||
      !influxConfig?.token ||
      !influxConfig?.org ||
      !influxConfig?.bucket
    ) {
      throw new Error(
        'Missing InfluxDB environment variables',
      );
    }

    const influxDB = new InfluxDB({
      url: influxConfig.url,
      token: influxConfig.token,
    });

    this.writeApi = influxDB.getWriteApi(
      influxConfig.org,
      influxConfig.bucket,
      's',
    );

    this.queryApi = influxDB.getQueryApi(
      influxConfig.org,
    );
  }

  async writeTelemetry(
    bbbId: string,
    zoneId: string | null | undefined,
    esp32Id: string,
    timestamp: string,
    sensors: SensorsDto,
  ) {
    const writtenSensors: Record<string, number> = {};

    for (const [sensor, value] of Object.entries(sensors)) {
      // Bỏ qua các trường không có giá trị hoặc không phải số hợp lệ
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value)
      ) {
        continue;
      }

      const point = new Point('sensor_telemetry')
        .tag('bbb_id', bbbId)
        .tag('esp32_id', esp32Id)
        .tag('scope', zoneId ? 'zone' : 'farm')
        .tag('sensor', sensor)
        .floatField('value', value)
        .timestamp(new Date(timestamp));

      // Chỉ thêm zone_id nếu thiết bị thực sự thuộc một Zone
      if (zoneId) {
        point.tag('zone_id', zoneId);
      }

      this.writeApi.writePoint(point);
      writtenSensors[sensor] = value;
    }

    if (Object.keys(writtenSensors).length === 0) {
      throw new Error('No valid sensor values to write');
    }

    await this.writeApi.flush();

    return {
      message: 'Telemetry written to InfluxDB',
      bbb_id: bbbId,
      zone_id: zoneId ?? null,
      esp32_id: esp32Id,
      scope: zoneId ? 'zone' : 'farm',
      sensors: writtenSensors,
      timestamp,
    };
  }

  async writeActuatorState(
    bbbId: string,
    esp32Id: string,
    zoneId: string | null | undefined,
    actuator: string,
    value: number,
    timestamp: string,
  ) {
    const point = new Point('actuator_state')
      .tag('bbb_id', bbbId)
      .tag('esp32_id', esp32Id)
      .tag('actuator', actuator)
      .tag('scope', zoneId ? 'zone' : 'farm')
      .floatField('value', value)
      .timestamp(new Date(timestamp));

    if (zoneId) {
      point.tag('zone_id', zoneId);
    }

    this.writeApi.writePoint(point);

    await this.writeApi.flush();

    return {
      message: 'Actuator state written to InfluxDB',
      bbb_id: bbbId,
      esp32_id: esp32Id,
      zone_id: zoneId ?? null,
      actuator,
      value,
      timestamp,
    };
  }

  async writeTestData() {
    const point = new Point('sensor_data')
      .tag('device_id', 'ESP32_01')
      .tag('zone_id', 'ZONE_01')
      .tag('sensor_type', 'temperature')
      .floatField('value', 28.5);

    this.writeApi.writePoint(point);

    await this.writeApi.flush();

    return {
      message: 'Data written to InfluxDB',
      measurement: 'sensor_data',
      device_id: 'ESP32_01',
      zone_id: 'ZONE_01',
      sensor_type: 'temperature',
      value: 28.5,
    };
  }

  async getLatestTelemetry(zoneId: string) {
  const bucket = this.configService.get<string>('influx.bucket');

  const query = `
    from(bucket: "${bucket}")
      |> range(start: -24h)
      |> filter(fn: (r) =>
        r._measurement == "sensor_telemetry" and
        r.zone_id == "${zoneId}"
      )
      |> group(columns: ["sensor"])
      |> last()
  `;

  const rows: any[] = [];

  await new Promise<void>((resolve, reject) => {
    this.queryApi.queryRows(query, {
      next: (row, tableMeta) => {
        const data = tableMeta.toObject(row);

        rows.push({
          sensor: data.sensor,
          value: data._value,
          timestamp: data._time,
        });
      },

      error: reject,
      complete: resolve,
    });
  });

  return rows;
}

  async getZoneTelemetry(
    zoneId: string,
    start = '-24h',
    stop = 'now()',
  ) {
    const bucket = this.configService.get<string>(
      'influx.bucket',
    );

    const query = `
      from(bucket: "${bucket}")
        |> range(
          start: ${start},
          stop: ${stop}
        )
        |> filter(fn: (r) =>
          r._measurement == "sensor_telemetry" and
          r.zone_id == "${zoneId}"
        )
        |> keep(columns: [
          "_time",
          "_value",
          "sensor",
          "zone_id",
          "bbb_id",
          "esp32_id"
        ])
        |> sort(columns: ["_time"])
    `;

    const rows: any[] = [];

    await new Promise<void>((resolve, reject) => {
      this.queryApi.queryRows(query, {
        next: (row, tableMeta) => {
          const data = tableMeta.toObject(row);

          rows.push({
            sensor: data.sensor,
            value: data._value,
            timestamp: data._time,
            zoneId: data.zone_id,
            bbbId: data.bbb_id,
            esp32Id: data.esp32_id,
          });
        },

        error: reject,

        complete: resolve,
      });
    });

    return rows;
  }

  async onModuleDestroy() {
    await this.writeApi.close();
  }
}