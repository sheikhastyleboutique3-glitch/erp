/**
 * main.ts — GWK V7 Production-hardened bootstrap
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as compression from 'compression';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['log', 'error', 'warn', 'debug'],
  });

  // Ensure uploads directories exist
  const uploadsDir = join(process.cwd(), 'uploads');
  const productsDir = join(uploadsDir, 'products');
  const brandingDir = join(uploadsDir, 'branding');
  const soundsDir = join(uploadsDir, 'sounds');

  [uploadsDir, productsDir, brandingDir, soundsDir].forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  // Security headers. crossOriginResourcePolicy is relaxed so the SPA on a
  // different origin can still load images served from /uploads/*.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );

  // Gzip responses (JSON payloads, reports, etc.)
  app.use(compression());

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Localhost (any port) and loopback are always permitted so local dev tools
  // (e.g. the Vite dev server on :5173) work even when NODE_ENV=production.
  const isLocalhost = (origin: string) =>
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isLocalhost(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
    credentials: true,
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Set global prefix BEFORE static assets to avoid prefix interference
  // Exclude /uploads from the global prefix so images are served at /uploads/* not /api/uploads/*
  app.setGlobalPrefix('api', {
    exclude: ['/uploads/(.*)', '/uploads'],
  });

  // Serve static uploads AFTER global prefix is set
  // Using process.cwd() ensures consistent path resolution in both dev and production
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads/',
    index: false,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('GWK V8 Enterprise Operations API')
      .setDescription(
        'Enterprise F&B Supply Chain & Requisition System \u2014 API Documentation',
      )
      .setVersion('7.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, config),
      { swaggerOptions: { persistAuthorization: true } },
    );
  }

  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`\ud83d\ude80 GWK V8 running on http://0.0.0.0:${port}`);
  console.log(`\ud83d\udcda Swagger: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
