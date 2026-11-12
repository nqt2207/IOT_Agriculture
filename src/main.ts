
declare const module: any;

import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { TransformResponseInterceptor } from './commons/interceptors/transform.response.interceptor';
import { AllExceptionsFilter } from './commons/filters/all-exceptions.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
import { validateEnvironments } from './configs/configuration';

async function bootstrap() {
  validateEnvironments();

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
  );

  const apiPrefix = 'api/v1';
  const apiVersion = '1.0';

  const { httpAdapter } = app.get(HttpAdapterHost);

  // ==========================================
  // CORS CONFIGURATION
  // ==========================================

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://iot-agriculture-frontend.onrender.com',
    ],
    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  // ==========================================
  // SECURITY
  // ==========================================

  app.use(helmet());

  // ==========================================
  // GLOBAL PREFIX & VERSIONING
  // ==========================================

  app.setGlobalPrefix(apiPrefix, {
    exclude: ['/'],
  });

  app.enableVersioning({
    type: VersioningType.URI,
  });

  // ==========================================
  // VALIDATION
  // ==========================================

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  // ==========================================
  // GLOBAL INTERCEPTORS & FILTERS
  // ==========================================

  app.useGlobalInterceptors(
    new TransformResponseInterceptor(),
  );

  app.useGlobalFilters(
    new AllExceptionsFilter(httpAdapter),
  );

  // ==========================================
  // SWAGGER
  // ==========================================

  const config = new DocumentBuilder()
    .setTitle('IOT')
    .setDescription('API for IOT')
    .setVersion(apiVersion)
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(
    app,
    config,
  );

  SwaggerModule.setup('docs', app, document);

  // ==========================================
  // START SERVER
  // ==========================================

  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT') ?? 3000;

  await app.listen(port, '0.0.0.0');

  Logger.log(`Application started on port: ${port}`);

  // ==========================================
  // HOT MODULE REPLACEMENT
  // ==========================================

  if (module.hot) {
    module.hot.accept();

    module.hot.dispose(() => app.close());
  }
}

bootstrap();
