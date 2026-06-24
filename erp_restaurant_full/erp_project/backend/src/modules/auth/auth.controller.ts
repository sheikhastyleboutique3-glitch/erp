import { Controller, Post, Get, Body, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  ChangePasswordDto,
  LoginDto,
  RefreshTokenDto,
  SwitchBranchDto,
} from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  // Brute-force protection: max 5 login attempts per minute per IP.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  // Max 10 refreshes per minute per IP.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('refresh')
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshToken(body.refresh_token);
  }

  @ApiBearerAuth()
  @Get('profile')
  getProfile(@CurrentUser('sub') userId: number) {
    return this.authService.getProfile(userId);
  }

  @ApiBearerAuth()
  @Patch('change-password')
  changePassword(
    @CurrentUser('sub') userId: number,
    @Body() body: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      userId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @ApiBearerAuth()
  @Patch('switch-branch')
  switchBranch(
    @CurrentUser('sub') userId: number,
    @Body() body: SwitchBranchDto,
  ) {
    return this.authService.switchBranch(userId, body.branchId);
  }
}
