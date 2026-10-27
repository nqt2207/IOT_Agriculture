
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';

import { BbbService } from '../bbb.service';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(
    private readonly bbbService: BbbService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    // Bỏ qua DeviceAuthGuard nếu endpoint được đánh dấu @Public().
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      'isPublic',
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request>();

    const deviceId = request.headers['x-device-id'];
    const deviceKey = request.headers['x-device-key'];

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
      throw new UnauthorizedException('Invalid device');
    }

    const isValid = await bcrypt.compare(
      deviceKey,
      bbb.secret_key_hash,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid device key');
    }

    request['bbb'] = bbb;

    return true;
  }
}
