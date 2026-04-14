import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard, AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpsertKsefTokenDto } from './dto/upsert-ksef-token.dto';

@Controller('companies')
@UseGuards(SupabaseAuthGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.companies.findAllForUser(req.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.companies.findOne(id, req.userId);
  }

  @Post()
  create(@Body() dto: CreateCompanyDto, @Req() req: AuthenticatedRequest) {
    return this.companies.create(req.userId, dto);
  }

  // ─── KSeF token management ──────────────────────────────────────────────

  /** GET /companies/:id/ksef-status — check if token is configured */
  @Get(':id/ksef-status')
  getKsefStatus(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.companies.getKsefStatus(id, req.userId);
  }

  /** PUT /companies/:id/ksef-token — save or update KSeF token */
  @Put(':id/ksef-token')
  upsertKsefToken(
    @Param('id') id: string,
    @Body() dto: UpsertKsefTokenDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.companies.upsertKsefToken(id, req.userId, dto);
  }

  /** DELETE /companies/:id/ksef-token — disconnect from KSeF */
  @Delete(':id/ksef-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteKsefToken(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.companies.deleteKsefToken(id, req.userId);
  }
}
