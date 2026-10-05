import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './configs/configuration';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ormConfig } from './ormconfig';
import { APP_GUARD } from '@nestjs/core';
import { InfluxModule } from './modules/influx/influx.module';
import { AuthModule } from './modules/auth/auth.module';
import { BbbModule } from './modules/bbb/bbb.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { ZoneModule } from './modules/zone/zone.module';
import { FarmModule } from './modules/farm/farm.module';


@Module({
  imports: [
    ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
    TypeOrmModule.forRoot(ormConfig),
    InfluxModule,
    AuthModule,
    BbbModule,
    JwtModule,
    ZoneModule,
    FarmModule,
  ],
  controllers: [AppController],
  providers: [
    AppService, 
    {
    provide: APP_GUARD,
    useClass: AuthGuard,
    }
  ],
})  
export class AppModule {}
