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

    // Primary: Authorization header (REST)
    // Fallback: ?token= query param (EventSource/SSE — browsers can't send custom headers)
    const header = req.headers['authorization'];
    let token: string | undefined;
    if (header?.startsWith('Bearer ')) {
      token = header.slice('Bearer '.length);
    } else if (typeof req.query['token'] === 'string') {
      token = req.query['token'];
    }
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid token');
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email ?? '';
    return true;
  }
}
