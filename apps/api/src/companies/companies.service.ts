import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { Company } from '@e-druczek/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { CreateCompanyDto } from './dto/create-company.dto';

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
}
