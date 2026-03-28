import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const config: JwtModuleOptions = {
          secret: configService.get<string>('JWT_SECRET') || 'default-secret',
        };
        const expiresIn = configService.get<string>('JWT_ACCESS_EXPIRATION');
        // The expiresIn value comes from environment configuration (JWT_ACCESS_EXPIRATION) in .env,
        // which is validated at runtime to match the ms format (e.g., "15m", "7d").
        // TypeScript's StringValue type is a template literal that only accepts specific patterns,
        // and we cannot statically prove the config value matches those patterns.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config.signOptions = {
          expiresIn: (expiresIn || '15m') as any,
        };
        return config;
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, GithubStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
