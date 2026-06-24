import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RecipesService } from './recipes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

export class RecipeComponentDto {
  @IsInt() componentProductId: number;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsOptional() @IsInt() unitId?: number;
  @IsOptional() @IsNumber() wastePct?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateRecipeDto {
  @IsInt() productId: number;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsNumber() @Min(0.0001) yieldQty?: number;
  @IsOptional() @IsInt() yieldUnitId?: number;
  @IsOptional() @IsNumber() prepLossPct?: number;
  @IsOptional() @IsNumber() cookingLossPct?: number;
  @IsOptional() @IsNumber() wastePct?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() notesAr?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RecipeComponentDto)
  components: RecipeComponentDto[];
}

export class UpdateRecipeDto {
  @IsOptional() @IsInt() productId?: number;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0.0001) yieldQty?: number;
  @IsOptional() @IsInt() yieldUnitId?: number;
  @IsOptional() @IsNumber() prepLossPct?: number;
  @IsOptional() @IsNumber() cookingLossPct?: number;
  @IsOptional() @IsNumber() wastePct?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() notesAr?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RecipeComponentDto)
  components?: RecipeComponentDto[];
}

export class SetActiveDto {
  @IsBoolean() isActive: boolean;
}

const MANAGE_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.BRANCH_MANAGER,
  Role.KITCHEN,
  Role.PASTRY,
];

@ApiTags('Recipes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recipes')
export class RecipesController {
  constructor(private svc: RecipesService) {}

  @Get()
  findAll(@Query('productId') productId?: string) {
    return this.svc.findAll(productId ? parseInt(productId, 10) : undefined);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/cost')
  cost(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cost(id);
  }

  @Post() @Roles(...MANAGE_ROLES)
  create(@Body() dto: CreateRecipeDto, @CurrentUser('id') userId: number) {
    return this.svc.create(dto, userId);
  }

  @Patch(':id') @Roles(...MANAGE_ROLES)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecipeDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.svc.update(id, dto, userId);
  }

  @Patch(':id/active') @Roles(...MANAGE_ROLES)
  setActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetActiveDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.svc.setActive(id, dto.isActive, userId);
  }

  @Patch(':id/approve') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.svc.approve(id, userId);
  }

  @Delete(':id') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.svc.remove(id, userId);
  }
}
