import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UserRepository } from 'src/databases/repositories/user.repository';
import * as bcrypt from 'bcryptjs';
import { ROLE } from 'src/commons/enums/user.enum';
import { LoginDto } from './dtos/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { User } from 'src/databases/entities/user.entity';
import { ApiOAuth2 } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly userRepository: UserRepository, 
        private readonly dataSource: DataSource,
    ){}        
    
    async login(body: LoginDto) {
        const { email, password } = body;

        // Check user exist        
        const userRecord = await this.userRepository.findOneBy({ email: email });
        if(!userRecord){
            throw new HttpException(
                'Incorrect email address or password',
                HttpStatus.UNAUTHORIZED,
            );
        }

        // Compare password (Thay thế argon2.verify bằng bcrypt.compare)
        const isPasswordValid = await bcrypt.compare(password, userRecord.password_hash);
        if(!isPasswordValid){
            throw new HttpException(
                'Incorrect email address or password',
                HttpStatus.UNAUTHORIZED,
            );
        }

        const payload = this.getPayload(userRecord);
        const { accessToken, refreshToken } = await this.signToken(payload);

        return {  
            message: "Login user successfully",
            result: {
                accessToken,
                refreshToken,
            },
        };
    } 

    async refresh(body: RefreshTokenDto){
        const { refreshToken } = body;

        // Verify valid or not
        const payloadRefreshToken = await this.jwtService.verifyAsync(refreshToken, {
            secret: this.configService.get('jwtAuth').jwtRefreshTokenSecret,
        });

        console.log(payloadRefreshToken);
        const userRecord = await this.userRepository.findOneBy({
            id: payloadRefreshToken.id,
        });
        if(!userRecord){
            throw new HttpException(
                'User not found',
                HttpStatus.UNAUTHORIZED,
            );
        }

        const payload = this.getPayload(userRecord);
        const { accessToken, refreshToken: newRefreshToken } = await this.signToken(payload);

        return {
            message: 'Refresh token successfully',
            result: {
                accessToken,
                refreshToken: newRefreshToken,
            }
        };
    }

    getPayload(user: User){
        return {
            id: user.id,
            username: user.username,
            role: user.role
        };
    }

    async signToken(payload){
        const payloadRefreshToken = {
            id: payload.id, 
        };

        const accessToken = await this.jwtService.signAsync(payload, {
            secret: this.configService.get('jwtAuth').jwtTokenSecret,
            expiresIn: '1d',
        });

        const refreshToken = await this.jwtService.signAsync(payloadRefreshToken, {
            secret: this.configService.get('jwtAuth').jwtRefreshTokenSecret,
            expiresIn: '7d',
        });

        return {
            accessToken,
            refreshToken,
        };
    }
}