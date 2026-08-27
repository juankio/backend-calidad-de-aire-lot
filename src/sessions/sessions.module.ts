import { Module } from '@nestjs/common';
import { SessionsController, HeatmapController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController, HeatmapController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
