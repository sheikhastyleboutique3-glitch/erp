import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  IsInt,
  IsPositive,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TransfersService } from './transfers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TransferStatus } from '@prisma/client';

class TransferItemDto {
  @IsInt() @IsPositive() @Type(() => Number) productId: number;
  @IsNumber() @Min(0.01) @Type(() => Number) quantity: number;
}

export class CreateTransferOrderDto {
  @IsInt() @IsPositive() @Type(() => Number) fromBranchId: number;
  @IsInt() @IsPositive() @Type(() => Number) toBranchId: number;
  @IsOptional() @IsString() notes?: string;
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => TransferItemDto)
  items: TransferItemDto[];
}

@ApiTags('Transfers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private svc: TransfersService) {}

  @Get() findAll(
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('direction') direction?: 'in' | 'out',
  ) {
    return this.svc.findAll({
      branchId: branchId ? +branchId : undefined,
      status: status ? (status as TransferStatus) : undefined,
      direction,
    });
  }

  // FEFO preview for a single line — shows which batches/expiries will move.
  @Get('fefo-preview') fefoPreview(
    @Query('fromBranchId', ParseIntPipe) fromBranchId: number,
    @Query('productId', ParseIntPipe) productId: number,
    @Query('quantity') quantity: string,
  ) {
    return this.svc.previewFefo(fromBranchId, productId, Number(quantity));
  }

  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post() create(@Body() dto: CreateTransferOrderDto, @CurrentUser('sub') userId: number) {
    return this.svc.create(dto, userId);
  }

  @Post(':id/receive') receive(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.svc.confirmReceive(id, userId);
  }

  @Post(':id/cancel') cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.svc.cancel(id, userId);
  }
}
