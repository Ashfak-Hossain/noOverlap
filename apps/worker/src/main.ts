import './instrumentation';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Nest (DI, modules, config, lifecycle hooks) but NO HTTP server and NO port.
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true, // hold early logs until the pino logger is installed below
  });

  app.useLogger(app.get(Logger)); // route all Nest logging through pino
  app.enableShutdownHooks(); // clean shutdown on SIGINT/SIGTERM
}

void bootstrap();
