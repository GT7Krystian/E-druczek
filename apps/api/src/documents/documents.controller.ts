import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard, AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@Controller('documents')
@UseGuards(SupabaseAuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.documents.findAllForUser(req.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.documents.findOne(id, req.userId);
  }

  @Post()
  create(@Body() dto: CreateDocumentDto, @Req() req: AuthenticatedRequest) {
    return this.documents.create(req.userId, dto);
  }
}
