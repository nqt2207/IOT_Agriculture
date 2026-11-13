
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GoogleGenAI } from '@google/genai';

import { Farm } from '../../databases/entities/farms.entity';
import { Zone } from '../../databases/entities/zone.entity';
import { Esp32Device } from '../../databases/entities/esp32.entity';
import { Actuator } from '../../databases/entities/actuator.entity';
import { ActuatorLog } from '../../databases/entities/actuator-log.entity';

import { InfluxService } from '../influx/influx.service';
import { ChatDto } from './dto/chat.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly influxService: InfluxService,

    @InjectRepository(Farm)
    private readonly farmRepository: Repository<Farm>,

    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,

    @InjectRepository(Esp32Device)
    private readonly esp32Repository: Repository<Esp32Device>,

    @InjectRepository(Actuator)
    private readonly actuatorRepository: Repository<Actuator>,

    @InjectRepository(ActuatorLog)
    private readonly actuatorLogRepository: Repository<ActuatorLog>,
  ) {
    const apiKey = this.configService.get<string>(
      'gemini.apiKey',
    );

    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY');
    }

    this.ai = new GoogleGenAI({ apiKey });

    this.model =
      this.configService.get<string>('gemini.model') ||
      'gemini-3.8-flash';
  }

  // =====================================================
  // GEMINI FUNCTION DECLARATIONS
  // =====================================================

  private readonly functionDeclarations = [
    {
      name: 'get_farm_overview',
      description:
        'Get general information about the authenticated user farm, including zones, devices and tank status.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          farm_name: {
            type: 'string',
            description: 'Farm name if the user explicitly mentions it.',
          },
        },
      },
    },

    {
      name: 'get_sensor_summary',
      description:
        'Get actual sensor measurements and statistics from InfluxDB. Use this for temperature, humidity, soil moisture, light, water flow and water volume questions.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          farm_name: {
            type: 'string',
            description: 'Farm name if specified by the user.',
          },
          scope: {
            type: 'string',
            enum: ['farm', 'zone'],
          },
          zone_name: {
            type: 'string',
            description: 'Zone name when scope is zone.',
          },
          metric: {
            type: 'string',
            enum: [
              'temperature',
              'humidity',
              'soil_moisture',
              'light',
              'water_flow',
              'water_volume',
            ],
          },
          period: {
            type: 'string',
            enum: [
              'today',
              'last_24_hours',
              'last_7_days',
              'last_30_days',
            ],
          },
        },
        required: ['scope', 'metric', 'period'],
      },
    },

    {
      name: 'get_tank_status',
      description:
        'Get the current water tank status of the authenticated farm.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          farm_name: {
            type: 'string',
            description: 'Farm name if specified.',
          },
        },
      },
    },

    {
      name: 'get_actuator_status',
      description:
        'Get current pump, fan and light status, desired state and control mode.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          farm_name: { type: 'string' },
          actuator: {
            type: 'string',
            description: 'Actuator name, for example pump1, fan or light.',
          },
          scope: {
            type: 'string',
            enum: ['farm', 'zone'],
          },
          zone_name: { type: 'string' },
        },
      },
    },

    {
      name: 'get_actuator_history',
      description:
        'Get recent actuator operation history from the database.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          farm_name: { type: 'string' },
          actuator: { type: 'string' },
          scope: {
            type: 'string',
            enum: ['farm', 'zone'],
          },
          zone_name: { type: 'string' },
          limit: {
            type: 'integer',
            description: 'Maximum number of history records, from 1 to 20.',
          },
        },
      },
    },
  ];

  // =====================================================
  // MAIN CHAT
  // =====================================================

  async chat(userId: number, dto: ChatDto) {
    const contents: any[] = [];

    // Lấy tối đa 12 tin nhắn gần nhất từ frontend.
    for (const item of dto.history ?? []) {
      contents.push({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: dto.message }],
    });

    const systemInstruction = `
You are Farm AI Assistant, an AI assistant for an agriculture IoT platform.

Your responsibilities:
1. Answer questions about the authenticated user's farm.
2. Use the available functions to retrieve real farm data.
3. Never invent sensor values, actuator states, tank status or history.
4. If no data is available, clearly tell the user.
5. Respond in Vietnamese unless the user uses another language.
6. Explain sensor values with units when available.
7. Do not claim that an actuator is physically ON or OFF based only on desired_state.
8. Distinguish actual_state from desired_state.
9. Tank status convention:
   - 0 = EMPTY (hết nước)
   - 1 = AVAILABLE (có nước)
   - null = UNKNOWN (chưa xác định)
10. You cannot control actuators. You can only read data.
11. If multiple farms or zones are available and the user's request is ambiguous, ask the user to specify one.
12. Interpret "hôm nay" using Vietnam local time (UTC+7).

Important:
Always use functions when the user asks about actual farm data.
Never guess missing data.
`;

    let response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction,
        tools: [
          {
            functionDeclarations: this.functionDeclarations as any,
          },
        ],
      },
    });

    // Cho phép tối đa 4 vòng Function Calling.
    for (let step = 0; step < 4; step++) {
      const functionCalls = response.functionCalls ?? [];

      if (functionCalls.length === 0) {
        return {
          reply:
            response.text ||
            'Xin lỗi, mình chưa thể tạo câu trả lời cho câu hỏi này.',
        };
      }

      const modelContent =
        response.candidates?.[0]?.content;

      if (modelContent) {
        contents.push(modelContent);
      }

      const functionResponses: any[] = [];

      for (const call of functionCalls) {
        if (!call.name) continue;

        const args = (call.args ?? {}) as Record<string, any>;

        this.logger.log(
          `Gemini requested function: ${call.name}`,
        );

        let result: any;

        try {
          result = await this.executeFunction(
            userId,
            call.name,
            args,
          );
        } catch (error) {
          this.logger.error(
            `Function ${call.name} failed`,
            error instanceof Error ? error.stack : String(error),
          );

          result = {
            error: 'Unable to retrieve the requested farm data.',
          };
        }

        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: {
              result,
            },
          },
        });
      }

      if (functionResponses.length === 0) {
        break;
      }

      contents.push({
        role: 'user',
        parts: functionResponses,
      });

      response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction,
          tools: [
            {
              functionDeclarations: this.functionDeclarations as any,
            },
          ],
        },
      });
    }

    return {
      reply:
        response.text ||
        'Mình chưa thể hoàn thành việc phân tích dữ liệu. Bạn thử hỏi lại nhé.',
    };
  }

  // =====================================================
  // FUNCTION DISPATCHER
  // =====================================================

  private async executeFunction(
    userId: number,
    functionName: string,
    args: Record<string, any>,
  ) {
    switch (functionName) {
      case 'get_farm_overview':
        return this.getFarmOverview(
          userId,
          args.farm_name,
        );

      case 'get_sensor_summary':
        return this.getSensorSummary(
          userId,
          args,
        );

      case 'get_tank_status':
        return this.getTankStatus(
          userId,
          args.farm_name,
        );

      case 'get_actuator_status':
        return this.getActuatorStatus(
          userId,
          args,
        );

      case 'get_actuator_history':
        return this.getActuatorHistory(
          userId,
          args,
        );

      default:
        return {
          error: 'Unknown function.',
        };
    }
  }

  // =====================================================
  // FARM RESOLUTION - AUTHORIZATION
  // =====================================================

  private async resolveFarm(
    userId: number,
    farmName?: string,
  ): Promise<{
    farm?: Farm;
    error?: any;
  }> {
    const farms = await this.farmRepository.find({
      where: {
        user_id: userId,
      },
      relations: {
        bbb: true,
        zones: true,
      },
    });

    if (farms.length === 0) {
      return {
        error: {
          message: 'Bạn chưa có nông trại nào được phân quyền.',
        },
      };
    }

    if (farmName) {
      const matched = farms.find(
        (farm) =>
          farm.name.toLowerCase() ===
          farmName.toLowerCase(),
      );

      if (!matched) {
        return {
          error: {
            message: 'Không tìm thấy nông trại có tên này trong tài khoản của bạn.',
            available_farms: farms.map((farm) => farm.name),
          },
        };
      }

      return { farm: matched };
    }

    if (farms.length > 1) {
      return {
        error: {
          message: 'Bạn có nhiều nông trại. Vui lòng chọn nông trại muốn truy vấn.',
          available_farms: farms.map((farm) => farm.name),
        },
      };
    }

    return { farm: farms[0] };
  }

  private async resolveZone(
    farm: Farm,
    zoneName?: string,
  ): Promise<{
    zone?: Zone;
    error?: any;
  }> {
    const zones = await this.zoneRepository.find({
      where: {
        farm_id: farm.id,
      },
    });

    if (zones.length === 0) {
      return {
        error: {
          message: 'Nông trại chưa có khu vực nào.',
        },
      };
    }

    if (zoneName) {
      const matched = zones.find(
        (zone) =>
          zone.name.toLowerCase() ===
          zoneName.toLowerCase(),
      );

      if (!matched) {
        return {
          error: {
            message: 'Không tìm thấy khu vực này.',
            available_zones: zones.map((zone) => zone.name),
          },
        };
      }

      return { zone: matched };
    }

    if (zones.length > 1) {
      return {
        error: {
          message: 'Vui lòng chỉ rõ khu vực muốn truy vấn.',
          available_zones: zones.map((zone) => zone.name),
        },
      };
    }

    return { zone: zones[0] };
  }

  // =====================================================
  // FARM OVERVIEW
  // =====================================================

  private async getFarmOverview(
    userId: number,
    farmName?: string,
  ) {
    const resolved = await this.resolveFarm(
      userId,
      farmName,
    );

    if (!resolved.farm) return resolved.error;

    const farm = resolved.farm;

    const deviceCount = farm.bbb
      ? await this.esp32Repository.count({
          where: {
            bbb_id: farm.bbb.id,
          },
        })
      : 0;

    return {
      farm_name: farm.name,
      tank_status:
        farm.tank_status === 0
          ? 'EMPTY'
          : farm.tank_status === 1
            ? 'AVAILABLE'
            : 'UNKNOWN',
      tank_status_updated_at:
        farm.tank_status_updated_at,
      zones: farm.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
      })),
      device_count: deviceCount,
      bbb_connected: Boolean(farm.bbb),
    };
  }

  // =====================================================
  // TANK STATUS
  // =====================================================

  private async getTankStatus(
    userId: number,
    farmName?: string,
  ) {
    const resolved = await this.resolveFarm(
      userId,
      farmName,
    );

    if (!resolved.farm) return resolved.error;

    const farm = resolved.farm;

    return {
      farm_name: farm.name,
      tank_status:
        farm.tank_status === 0
          ? 'EMPTY'
          : farm.tank_status === 1
            ? 'AVAILABLE'
            : 'UNKNOWN',
      tank_status_updated_at:
        farm.tank_status_updated_at,
      explanation:
        farm.tank_status === 0
          ? 'Bồn nước đang hết nước.'
          : farm.tank_status === 1
            ? 'Bồn nước đang có nước.'
            : 'Chưa xác định được trạng thái bồn nước.',
    };
  }

  // =====================================================
  // SENSOR SUMMARY
  // =====================================================

  private async getSensorSummary(
    userId: number,
    args: Record<string, any>,
  ) {
    const resolved = await this.resolveFarm(
      userId,
      args.farm_name,
    );

    if (!resolved.farm) return resolved.error;

    const farm = resolved.farm;

    if (!farm.bbb) {
      return {
        error: 'Farm chưa được gắn BeagleBone Black.',
      };
    }

    let zoneId: string | undefined;

    if (args.scope === 'zone') {
      const resolvedZone = await this.resolveZone(
        farm,
        args.zone_name,
      );

      if (!resolvedZone.zone) {
        return resolvedZone.error;
      }

      zoneId = String(resolvedZone.zone.id);
    }

    if (!['farm', 'zone'].includes(args.scope)) {
      return { error: 'Invalid scope.' };
    }

    const allowedMetrics = [
      'temperature',
      'humidity',
      'soil_moisture',
      'light',
      'water_flow',
      'water_volume',
    ];

    const allowedPeriods = [
      'today',
      'last_24_hours',
      'last_7_days',
      'last_30_days',
    ];

    if (!allowedMetrics.includes(args.metric)) {
      return { error: 'Invalid sensor metric.' };
    }

    if (!allowedPeriods.includes(args.period)) {
      return { error: 'Invalid time period.' };
    }

    const summary =
      await this.influxService.getSensorSummary(
        farm.bbb.device_id,
        args.scope,
        args.metric,
        args.period,
        zoneId,
      );

    return {
        farm: farm.name,
        metric: args.metric,
        ...summary,
    };
  }

  // =====================================================
  // ACTUATOR STATUS
  // =====================================================

  private async getActuatorStatus(
    userId: number,
    args: Record<string, any>,
  ) {
    const resolved = await this.resolveFarm(
      userId,
      args.farm_name,
    );

    if (!resolved.farm) return resolved.error;

    const farm = resolved.farm;

    if (!farm.bbb) {
      return { error: 'Farm chưa có BBB.' };
    }

    const query = this.actuatorRepository
      .createQueryBuilder('actuator')
      .innerJoinAndSelect(
        'actuator.esp32',
        'esp32',
      )
      .leftJoinAndSelect(
        'esp32.zone',
        'zone',
      )
      .where('esp32.bbb_id = :bbbId', {
        bbbId: farm.bbb.id,
      });

    if (args.scope) {
      query.andWhere(
        'esp32.scope = :scope',
        { scope: args.scope },
      );
    }

    if (args.zone_name) {
      query.andWhere(
        'LOWER(zone.name) = LOWER(:zoneName)',
        { zoneName: args.zone_name },
      );
    }

    if (args.actuator) {
      query.andWhere(
        'LOWER(actuator.name) = LOWER(:actuator)',
        { actuator: args.actuator },
      );
    }

    const actuators = await query.getMany();

    return {
      farm_name: farm.name,
      count: actuators.length,
      actuators: actuators.map((item) => ({
        name: item.name,
        type: item.type,
        scope: item.esp32.scope,
        zone: item.esp32.zone?.name ?? null,
        control_mode: item.control_mode,
        reported_control_mode:
          item.reported_control_mode,
        desired_state: item.desired_state,
        actual_state: item.actual_state,
        state_updated_at: item.state_updated_at,
      })),
    };
  }

  // =====================================================
  // ACTUATOR HISTORY
  // =====================================================

  private async getActuatorHistory(
    userId: number,
    args: Record<string, any>,
  ) {
    const resolved = await this.resolveFarm(
      userId,
      args.farm_name,
    );

    if (!resolved.farm) return resolved.error;

    const farm = resolved.farm;

    if (!farm.bbb) {
      return { error: 'Farm chưa có BBB.' };
    }

    const limit = Math.min(
      20,
      Math.max(1, Number(args.limit) || 10),
    );

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
      .leftJoinAndSelect(
        'esp32.zone',
        'zone',
      )
      .where('esp32.bbb_id = :bbbId', {
        bbbId: farm.bbb.id,
      });

    if (args.actuator) {
      query.andWhere(
        'LOWER(log.actuator_name) = LOWER(:actuator)',
        { actuator: args.actuator },
      );
    }

    if (args.scope) {
      query.andWhere(
        'esp32.scope = :scope',
        { scope: args.scope },
      );
    }

    if (args.zone_name) {
      query.andWhere(
        'LOWER(zone.name) = LOWER(:zoneName)',
        { zoneName: args.zone_name },
      );
    }

    const logs = await query
      .orderBy('log.created_at', 'DESC')
      .take(limit)
      .getMany();

    return {
      farm_name: farm.name,
      count: logs.length,
      history: logs.map((log) => ({
        actuator: log.actuator_name,
        control_mode: log.control_mode,
        commanded_state: log.commanded_state,
        actual_state: log.actual_state,
        source: log.source,
        zone: log.actuator?.esp32?.zone?.name ?? null,
        created_at: log.created_at,
      })),
    };
  }
}
