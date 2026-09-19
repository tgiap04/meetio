import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, UsageRecord } from '../database/entities/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';

@Module({
  // `AuthModule` is imported only for its exported `GoogleTokenVerifier`
  // (phase-12) — `AuthModule` does not import `UsersModule`, so there is no
  // cycle.
  imports: [TypeOrmModule.forFeature([User, UsageRecord]), AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
