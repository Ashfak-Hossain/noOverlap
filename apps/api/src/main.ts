import './instrumentation';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis/redis.provider';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  // Socket emissions travel through Redis so they reach clients connected to any instance, not only
  // the one that handled the request. Installed before listening, or early connections would attach
  // to the default in-process adapter and never see cross-instance traffic.
  const redisAdapter = new RedisIoAdapter(app, app.get<Redis>(REDIS_CLIENT));
  await redisAdapter.connect();
  app.useWebSocketAdapter(redisAdapter);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('noOverlap API')
    .setDescription(
      'Booking platform — correctness under concurrency and failure',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // Without this the framework never runs its teardown, so connections stay open, the process
  // cannot exit, and a container told to stop is killed instead — dropping whatever was in flight.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
