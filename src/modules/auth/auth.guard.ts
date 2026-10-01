
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from 'src/commons/decorators/public.decorator';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/commons/decorators/role.decorator';
import { ROLE } from 'src/commons/enums/user.enum';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
            private readonly jwtService: JwtService,
            private readonly configService: ConfigService,
            private reflector: Reflector,
    ){}   

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
    
    const request = context.switchToHttp().getRequest();

    const token = this.extractTokenFromHeader(request);

    if(!token && !isPublic) {
        throw new UnauthorizedException();
    }

    try{
        const jwtConfig = this.configService.get('jwtAuth');

        const payload = await this.jwtService.verifyAsync(token!, {
            secret: jwtConfig.jwtTokenSecret,
        });

        request['user'] = payload;
    }catch{
      if(!isPublic){
         throw new UnauthorizedException();
      }
    }
    if (isPublic) {
      // 💡 See this condition
      return true;
    }


    //check role
    const requiredRoles = this.reflector.getAllAndOverride<ROLE[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    
    if (!requiredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
      return requiredRoles.some((role) => user.role?.includes(role));
    }

  

  private extractTokenFromHeader(request: Request) {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined
  }
}
