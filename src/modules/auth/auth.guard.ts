import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../../commons/decorators/public.decorator';
import { ROLES_KEY } from '../../commons/decorators/role.decorator';
import { ROLE } from '../../commons/enums/user.enum';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Kiểm tra endpoint có @Public() hay không
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Endpoint public không cần JWT
    if (isPublic) {
      return true;
    }

    // 2. Lấy request
    const request = context.switchToHttp().getRequest();

    // 3. Lấy JWT từ Authorization header
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException(
        'Missing or invalid authorization token',
      );
    }

    // 4. Xác thực JWT
    try {
      const jwtConfig = this.configService.get('jwtAuth');

      if (!jwtConfig?.jwtTokenSecret) {
        throw new Error('JWT secret is not configured');
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtConfig.jwtTokenSecret,
      });

      // Gắn thông tin user vào request
      request.user = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // 5. Kiểm tra quyền truy cập
    const requiredRoles = this.reflector.getAllAndOverride<ROLE[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Endpoint không yêu cầu role cụ thể
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = request.user;

    if (!user?.role || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return true;
  }

  // Trích xuất Bearer Token
  private extractTokenFromHeader(request: any): string | undefined {
    const authorization = request.headers?.authorization;

    if (!authorization) {
      return undefined;
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      return undefined;
    }

    return token;
  }
}