import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { Request } from 'express';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = header.slice('Bearer '.length);

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid token');
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email ?? '';
    return true;
  }
}
