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
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';

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
}
