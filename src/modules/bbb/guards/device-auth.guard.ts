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
    //console.log('>>> DeviceAuthGuard CALLED');

    const request = context
      .switchToHttp()
      .getRequest<Request>();

    const deviceId = request.headers['x-device-id'];
    const deviceKey = request.headers['x-device-key'];

    //console.log('deviceId:', deviceId);
    //console.log('deviceKey:', deviceKey);

    if (
      typeof deviceId !== 'string' ||
      typeof deviceKey !== 'string'
    ) {
      throw new UnauthorizedException(
        'Missing device authentication headers',
      );
    }

    const bbb = await this.bbbService.findByDeviceId(
      deviceId,
    );

    if (!bbb) {
      throw new UnauthorizedException(
        'Invalid device',
      );
    }

    // So sánh deviceKey (plain text) với hash lưu trong DB bằng bcrypt
    const isValid = await bcrypt.compare(
      deviceKey,
      bbb.secret_key_hash,
    );

    if (!isValid) {
      throw new UnauthorizedException(
        'Invalid device key',
      );
    }

    request['bbb'] = bbb;

    return true;
  }
}