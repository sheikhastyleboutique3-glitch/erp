import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, UseGuards, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { Response } from 'express';
import * as fs from 'fs';

const storage = diskStorage({
  destination: './uploads/products',
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `product-${unique}${extname(file.originalname)}`);
  },
});

const UTF8_BOM = '\uFEFF';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private svc: ProductsService) {}

  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('includeArchived') includeArchived?: string,
    @Query('sellable') sellable?: string,
  ) {
    return this.svc.findAll(categoryId ? +categoryId : undefined, search, includeArchived === 'true', sellable === 'true');
  }

  /** Returns only archived products — SUPER_ADMIN only */
  @Get('archived')
  @Roles(Role.SUPER_ADMIN)
  findArchived() {
    return this.svc.findArchived();
  }

  @Get('export')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT)
  async exportCsv(
    @Query('categoryId') categoryId?: string,
    @Res() res?: Response,
  ) {
    const catId = categoryId ? +categoryId : undefined;
    const products = await this.svc.exportAll(catId);
    // RFC-4180 field serializer: quote only when needed, escape embedded quotes.
    const field = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n\r/]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvRow = (cells: unknown[]): string => cells.map(field).join(',') + '\r\n';
    let csvContent = UTF8_BOM + csvRow(['SKU','Name','NameAr','Category','CategoryAr','Unit','CostPrice','MinStock','ReorderPoint','TaxCategory','YieldFactor','TracksExpiry','ExpiryTrackingType','ShelfLifeDays','Supplier','Allergens']);
    for (const p of products as any[]) {
      csvContent += csvRow([p.sku, p.name || '', p.nameAr || '', p.category?.name || '', p.category?.nameAr || '', p.unit?.abbreviation || '', p.costPrice, p.minStockLevel, p.reorderPoint, p.taxCategory || '', p.yieldFactor, p.tracksExpiry ? 'YES' : 'NO', p.expiryTrackingType || '', p.shelfLifeDays || '', p.supplier?.name || '', (p.allergens || []).join('|')]);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.end(csvContent);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT)
  create(@Body() dto: any, @CurrentUser('sub') userId: number) { return this.svc.create(dto, userId); }

  @Post('bulk-import')
  @Roles(Role.SUPER_ADMIN, Role.PROCUREMENT)
  bulkImport(@Body() body: { products: any[] }, @CurrentUser('sub') userId: number) { return this.svc.bulkImport(body.products, userId); }

  @Post(':id/duplicate')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT)
  duplicate(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) { return this.svc.duplicate(id, userId); }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser('sub') userId: number) { return this.svc.update(id, dto, userId); }

  @Patch(':id/archive')
  @Roles(Role.SUPER_ADMIN)
  archive(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) { return this.svc.archive(id, userId); }

  /** Restore an archived product back to active */
  @Patch(':id/restore')
  @Roles(Role.SUPER_ADMIN)
  restore(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) { return this.svc.restore(id, userId); }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) { return this.svc.remove(id, userId); }

  @Delete(':id/image')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT)
  deleteImage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { imageUrl: string },
    @CurrentUser('sub') userId: number,
  ) {
    return this.svc.deleteImage(id, body.imageUrl, userId);
  }

  @Post(':id/image')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', { storage, limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: number,
  ) {
    let finalFilename = file.filename;
    try {
      const sharp = require('sharp');
      const jpgFilename = file.filename.replace(/\.[^.]+$/, '.jpg');
      const outputPath = join('./uploads/products', jpgFilename);
      await sharp(file.path).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, progressive: true }).toFile(outputPath);
      if (file.path !== outputPath) fs.unlinkSync(file.path);
      finalFilename = jpgFilename;
    } catch (e) {
      console.error('Sharp compression failed:', e);
    }
    const imageUrl = `/uploads/products/${finalFilename}`;
    return this.svc.updateImage(id, imageUrl, userId);
  }
}
