import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';
import * as bcrypt from 'bcryptjs';

import { BbbService } from '../bbb.service';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(
    private readonly bbbService: BbbService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request>();

    // 1. Lấy thông tin xác thực từ headers
    const deviceId = request.headers['x-device-id'];
    const deviceKey = request.headers['x-device-key'];

    // 2. Kiểm tra headers
    if (
      typeof deviceId !== 'string' ||
      typeof deviceKey !== 'string' ||
      !deviceId.trim() ||
      !deviceKey.trim()
    ) {
      throw new UnauthorizedException(
        'Missing device authentication headers',
      );
    }

    // 3. Tìm BBB trong database
    const bbb = await this.bbbService.findByDeviceId(deviceId);

    if (!bbb || !bbb.secret_key_hash) {
      throw new UnauthorizedException(
        'Invalid device',
      );
    }

    // 4. Kiểm tra device key
    const isValid = await bcrypt.compare(
      deviceKey,
      bbb.secret_key_hash,
    );

    if (!isValid) {
      throw new UnauthorizedException(
        'Invalid device key',
      );
    }

    // 5. Gắn BBB đã xác thực vào request
    request['bbb'] = bbb;

    return true;
  }
}