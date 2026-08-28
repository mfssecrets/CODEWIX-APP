import { redirect } from 'next/navigation';

/**
 * /forgot-password — removed.
 *
 * CodeWIX uses email-OTP sign-in only (no passwords, no magic links), so a
 * password reset page is not applicable. Any old link is redirected to the
 * sign-in page.
 */
export default function ForgotPasswordPage() {
  redirect('/signin');
}
