import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import * as fs from 'fs';

const storage = diskStorage({
  destination: './uploads/general',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`),
});

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  // Phase 1: 2MB cap + sharp auto-compression
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 2 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: Express.Multer.File) {
    let finalFilename = file.filename;
    const isImage = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname);
    
    if (isImage) {
      try {
        const sharp = require('sharp');
        // Always output as .jpg for consistency
        const jpgFilename = file.filename.replace(/\.[^.]+$/, '.jpg');
        const outputPath = join('./uploads/general', jpgFilename);
        
        await sharp(file.path)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 78, progressive: true })
          .toFile(outputPath);
        
        // Remove original file if different from output
        if (file.path !== outputPath) {
          fs.unlinkSync(file.path);
        }
        
        finalFilename = jpgFilename;
      } catch (e) {
        // sharp unavailable — serve original
        console.error('Sharp compression failed:', e);
      }
    }
    
    return { url: `/uploads/general/${finalFilename}`, filename: finalFilename };
  }
}
