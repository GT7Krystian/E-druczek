import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Auth callback route for Supabase PKCE flow.
 *
 * Supabase redirects here after email verification (signup, password reset, magic link).
 * Exchanges the ?code= for a session, then redirects to the target page.
 *
 * Flow: Supabase verify → /auth/callback?code=xxx&next=/reset-password → exchange → redirect
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Code missing or exchange failed → redirect to login with error
  return NextResponse.redirect(
    new URL('/login?error=link_expired', request.url),
  );
}
