import { Inject, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { Company } from '@e-druczek/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpsertKsefTokenDto } from './dto/upsert-ksef-token.dto';

export interface KsefConnectionStatus {
  configured: boolean;
  tokenPreview: string | null;  // e.g. "20260414-EC-41CF8..." (first 24 chars)
  updatedAt: string | null;
}

@Injectable()
export class CompaniesService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async findAllForUser(userId: string): Promise<Company[]> {
    const { data, error } = await this.supabase
      .from('companies')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data ?? [];
  }

  async findOne(id: string, userId: string): Promise<Company> {
    const { data, error } = await this.supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException(`Company ${id} not found`);
    return data;
  }

  async create(userId: string, dto: CreateCompanyDto): Promise<Company> {
    const { data, error } = await this.supabase
      .from('companies')
      .insert({ ...dto, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Returns KSeF connection status without exposing the full token. */
  async getKsefStatus(companyId: string, userId: string): Promise<KsefConnectionStatus> {
    await this.findOne(companyId, userId); // ownership check

    const { data } = await this.supabase
      .from('company_ksef_connections')
      .select('ksef_token_encrypted, updated_at')
      .eq('company_id', companyId)
      .maybeSingle();

    if (!data?.ksef_token_encrypted) {
      return { configured: false, tokenPreview: null, updatedAt: null };
    }

    return {
      configured: true,
      tokenPreview: data.ksef_token_encrypted.slice(0, 24) + '...',
      updatedAt: data.updated_at,
    };
  }

  /** Saves (upserts) a KSeF token for the company. Verifies NIP matches. */
  async upsertKsefToken(
    companyId: string,
    userId: string,
    dto: UpsertKsefTokenDto,
  ): Promise<KsefConnectionStatus> {
    const company = await this.findOne(companyId, userId); // ownership check

    // Extract NIP from token and verify it matches the company NIP
    const nipMatch = dto.token.match(/\|nip-(\d{10})\|/);
    if (!nipMatch || nipMatch[1] !== company.nip) {
      throw new ForbiddenException(
        `Token jest dla NIP ${nipMatch?.[1] ?? '?'}, a firma ma NIP ${company.nip}`,
      );
    }

    const { error } = await this.supabase
      .from('company_ksef_connections')
      .upsert(
        { company_id: companyId, ksef_token_encrypted: dto.token },
        { onConflict: 'company_id' },
      );
    if (error) throw error;

    return this.getKsefStatus(companyId, userId);
  }

  /** Removes the KSeF token (disconnect from KSeF). */
  async deleteKsefToken(companyId: string, userId: string): Promise<void> {
    await this.findOne(companyId, userId); // ownership check

    const { error } = await this.supabase
      .from('company_ksef_connections')
      .update({ ksef_token_encrypted: null })
      .eq('company_id', companyId);
    if (error) throw error;
  }
}
