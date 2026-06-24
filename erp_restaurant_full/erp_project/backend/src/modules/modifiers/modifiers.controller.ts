import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ModifiersService } from './modifiers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

export class OptionDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsNumber() priceDelta?: number;
  @IsOptional() @IsInt() componentProductId?: number | null;
  @IsOptional() @IsNumber() qtyToDeduct?: number;
  @IsOptional() @IsInt() sortOrder?: number;
}
export class GroupDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsInt() minSelect?: number;
  @IsOptional() @IsInt() maxSelect?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
}
export class SetProductGroupsDto {
  @IsArray() @IsInt({ each: true }) groupIds: number[];
}

const MANAGE: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER];

@ApiTags('Modifiers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('modifiers')
export class ModifiersController {
  constructor(private svc: ModifiersService) {}

  @Get('groups')
  listGroups() {
    return this.svc.listGroups();
  }

  @Get('product/:productId')
  forProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.svc.forProduct(productId);
  }

  @Post('groups') @Roles(...MANAGE)
  createGroup(@Body() dto: GroupDto) {
    return this.svc.createGroup(dto);
  }

  @Patch('groups/:id') @Roles(...MANAGE)
  updateGroup(@Param('id', ParseIntPipe) id: number, @Body() dto: GroupDto) {
    return this.svc.updateGroup(id, dto);
  }

  @Delete('groups/:id') @Roles(...MANAGE)
  removeGroup(@Param('id', ParseIntPipe) id: number) {
    return this.svc.removeGroup(id);
  }

  @Post('product/:productId') @Roles(...MANAGE)
  setProductGroups(@Param('productId', ParseIntPipe) productId: number, @Body() dto: SetProductGroupsDto) {
    return this.svc.setProductGroups(productId, dto.groupIds);
  }
}
