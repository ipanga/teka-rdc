import { Module } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { AddressesController } from './addresses.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CitiesModule } from '../cities/cities.module';

@Module({
  imports: [PrismaModule, CitiesModule],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
