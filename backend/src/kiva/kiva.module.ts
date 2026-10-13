import { Global, Module } from '@nestjs/common';
import { KivaService } from './kiva.service';

@Global()
@Module({
  providers: [KivaService],
  exports: [KivaService],
})
export class KivaModule {}
