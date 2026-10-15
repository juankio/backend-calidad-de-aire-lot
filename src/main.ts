import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('api', {
    exclude: ['/', 'health'],
  });

  // Configuración de CORS blindada para despliegue en Vercel, Railway, Render y desarrollo local
  const allowedOriginPatterns: (string | RegExp)[] = [
    'https://frontend-calidad-de-aire-lot.vercel.app',
    /^https:\/\/frontend-calidad-de-aire-lot.*\.vercel\.app$/,
    /^https:\/\/.*\.vercel\.app$/,
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  ];

  const envOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : [];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Permitir peticiones sin encabezado Origin (ESP32, IoT hardware, Postman, cURL, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Orígenes definidos explícitamente por variable de entorno
      if (envOrigins.includes(origin) || envOrigins.includes('*')) {
        return callback(null, true);
      }

      // Validar contra patrones permitidos (Vercel production, previews, localhost)
      const isAllowed = allowedOriginPatterns.some((pattern) => {
        if (typeof pattern === 'string') return pattern === origin;
        return pattern.test(origin);
      });

      if (isAllowed) {
        return callback(null, true);
      }

      // En desarrollo permitir cualquier origen como fallback flexible
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      callback(
        new Error(
          `[CORS] Acceso denegado: El origen "${origin}" no está en la lista de orígenes permitidos.`,
        ),
      );
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'x-device-id',
    ],
    credentials: true,
  });

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT || 3002;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 [BACKEND] Servidor Air Guardian (NestJS + Bun) corriendo en http://0.0.0.0:${port}`);
}

bootstrap();
