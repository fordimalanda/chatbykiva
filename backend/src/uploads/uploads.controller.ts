import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CurrentUser } from '../auth/session.guard';

/** Fichiers exécutables par un navigateur : refusés pour éviter le XSS via /uploads */
const BLOCKED_EXTENSIONS = ['.html', '.htm', '.xhtml', '.svg', '.js', '.mjs', '.php', '.exe', '.bat', '.cmd', '.sh'];

export interface UploadedFileResponse {
  url: string;
  name: string;
  size: number;
  mimeType: string;
  type: 'image' | 'video' | 'audio' | 'document';
}

@Controller('uploads')
export class UploadsController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const ext = extname(file.originalname) || '';
          callback(null, `file_${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        // Le SessionGuard a déjà résolu la session : on refuse avant d'écrire sur le disque
        if (!(req as any).username) {
          return callback(new UnauthorizedException('Connexion requise pour envoyer un fichier.'), false);
        }
        const ext = extname(file.originalname || '').toLowerCase();
        if (BLOCKED_EXTENSIONS.includes(ext)) {
          return callback(new BadRequestException(`Type de fichier non autorisé (${ext}).`), false);
        }
        callback(null, true);
      },
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max for videos, docs, etc.
      },
    })
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser({ required: true }) _current: string,
  ): UploadedFileResponse {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni.');
    }

    const mime = file.mimetype.toLowerCase();
    let type: 'image' | 'video' | 'audio' | 'document' = 'document';

    if (mime.startsWith('image/')) {
      type = 'image';
    } else if (mime.startsWith('video/')) {
      type = 'video';
    } else if (mime.startsWith('audio/')) {
      type = 'audio';
    }

    return {
      url: `/uploads/${file.filename}`,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      type,
    };
  }
}
