import { Controller, Get, Post, Body, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import * as fs from 'fs';

const logoStorage = diskStorage({
  destination: './uploads/branding',
  filename: (req, file, cb) => cb(null, `logo-${Date.now()}${extname(file.originalname)}`),
});

const soundStorage = diskStorage({
  destination: './uploads/sounds',
  filename: (req, file, cb) => cb(null, `sound-${Date.now()}${extname(file.originalname) || '.mp3'}`),
});

// Allowed audio formats for notification sounds.
const ALLOWED_SOUND_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|webm)$/i;
const ALLOWED_SOUND_MIME = /^(audio\/|application\/ogg)/i;

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private svc: SettingsService) {}
  
  @Get() 
  findAll(@Query('group') group?: string) { 
    return this.svc.findAll(group); 
  }
  
  @Post() 
  @Roles(Role.SUPER_ADMIN) 
  upsert(@Body() body: { key: string; value: string; group?: string }, @CurrentUser('sub') userId: number) { 
    return this.svc.upsert(body.key, body.value, body.group, userId); 
  }
  
  @Post('bulk') 
  @Roles(Role.SUPER_ADMIN) 
  upsertMany(@Body() body: { settings: any[] }, @CurrentUser('sub') userId: number) { 
    return this.svc.upsertMany(body.settings, userId); 
  }
  
  @Post('upload-logo') 
  @Roles(Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('logo', { storage: logoStorage, limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    let finalFilename = file.filename;
    
    // Compress logo if it's a raster image (not SVG)
    const isSvg = /\.svg$/i.test(file.originalname);
    if (!isSvg) {
      try {
        const sharp = require('sharp');
        // Output as PNG for logos to preserve transparency
        const pngFilename = file.filename.replace(/\.[^.]+$/, '.png');
        const outputPath = join('./uploads/branding', pngFilename);
        
        await sharp(file.path)
          .resize(400, 200, { fit: 'inside', withoutEnlargement: true })
          .png({ quality: 90 })
          .toFile(outputPath);
        
        // Remove original file if different from output
        if (file.path !== outputPath) {
          fs.unlinkSync(file.path);
        }
        
        finalFilename = pngFilename;
      } catch (e) {
        // If sharp fails, continue with original file
        console.error('Sharp compression failed:', e);
      }
    }
    
    const url = `/uploads/branding/${finalFilename}`;
    await this.svc.upsert('company_logo', url, 'branding');
    return { url };
  }

  @Post('upload-sound')
  @Roles(Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('sound', { storage: soundStorage, limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadSound(@UploadedFile() file: Express.Multer.File, @Body() body: { key?: string }, @CurrentUser('sub') userId: number) {
    if (!file) throw new BadRequestException('No sound file uploaded');
    const okExt = ALLOWED_SOUND_EXT.test(file.originalname);
    const okMime = ALLOWED_SOUND_MIME.test(file.mimetype || '');
    if (!okExt && !okMime) {
      try { fs.unlinkSync(file.path); } catch { /* ignore */ }
      throw new BadRequestException('Unsupported audio format. Use mp3, wav, ogg, m4a, aac or webm.');
    }
    const url = `/uploads/sounds/${file.filename}`;
    // If a target setting key is supplied, persist it (must be a sound_* key).
    if (body?.key && /^sound_/.test(body.key)) {
      await this.svc.upsert(body.key, url, 'sound', userId);
    }
    return { url };
  }
}
