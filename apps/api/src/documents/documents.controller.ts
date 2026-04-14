import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
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

  /**
   * SSE stream — real-time ksef_status updates for all user's documents.
   * Token passed as ?token= query param (EventSource can't set headers).
   * Pushes event on each poll (every 4s).
   */
  @Get('status-stream')
  async statusStream(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = async () => {
      try {
        const docs = await this.documents.findAllForUser(req.userId);
        res.write(`data: ${JSON.stringify(docs)}\n\n`);
      } catch {
        // ignore — client will reconnect
      }
    };

    await send();
    const interval = setInterval(send, 4000);

    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.documents.findOne(id, req.userId);
  }

  @Post()
  create(@Body() dto: CreateDocumentDto, @Req() req: AuthenticatedRequest) {
    return this.documents.create(req.userId, dto);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.documents.submit(id, req.userId);
  }
}
