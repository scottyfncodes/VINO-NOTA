/**
 * Shared shell for the auth pages. Sending signed-in visitors home is done per
 * page (sign-in, sign-up, forgot-password), not here: a reset link must reach
 * /reset-password even when the browser is signed in, as it usually is on a phone.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main id="main">{children}</main>;
}
