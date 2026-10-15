import { Module } from '@nestjs/common';
import { SessionsController, HeatmapController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionsRepository } from './sessions.repository';

@Module({
  controllers: [SessionsController, HeatmapController],
  providers: [SessionsService, SessionsRepository],
  exports: [SessionsService, SessionsRepository],
})
export class SessionsModule {}
