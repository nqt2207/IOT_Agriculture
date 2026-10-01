import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRepository } from 'src/databases/repositories/user.repository';
import { JwtService } from '@nestjs/jwt';
import { User } from 'src/databases/entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';


@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    //MailModule, // <-- thêm dòng này
  ],
  controllers: [AuthController],
  providers: [
    AuthService, 
    JwtService, 
    UserRepository, 
  ],
}) 
export class AuthModule {}
