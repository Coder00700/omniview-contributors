# Connect real services

No accounts, keys, public hosting or government data access have been provisioned automatically. Copy `.env.example` to `.env` and fill only your own credentials. Never put server secrets in `VITE_` variables.

## 1. Authentication and storage

Create a Supabase project and run `supabase/schema.sql` once. Add the project URL and public anon/publishable key to the Vite settings, and server URL/anon key settings. Enable email sign-in with confirmation. Configure your site's exact HTTPS origin as Site URL and allowed redirect URL; allow localhost only for development. For Google, enable its OAuth provider and configure the Google client credentials and provider callback following Supabase's setup page.

Configure production SMTP: Supabase's default email sender is restricted and is not suitable for arbitrary public contributors. Google OAuth avoids paying for individual SMS, while email provider free quotas vary. Do not promise unlimited free OTP. Phone OTP requires an enabled SMS provider and any applicable sender registration. Only then set `VITE_PHONE_AUTH_ENABLED=true`.

Video storage uses Backblaze B2. Follow [BACKBLAZE.md](BACKBLAZE.md) for the private bucket, server-only credentials, CORS and database migration. Supabase retains GPS tracks and archive records. B2 storage/bandwidth and Supabase database quotas depend on your plans. Test real account isolation and uploads before launch.

References:
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/phone-login
- https://www.backblaze.com/docs/en/cloud-storage-call-the-s3-compatible-api

## 2. Modern bot protection

Create a Cloudflare Turnstile widget for your deployment domains. Put its public site key in `VITE_TURNSTILE_SITE_KEY`. Configure the Turnstile secret in Supabase Auth's CAPTCHA settings and enable protection there. The browser passes the token to Supabase for server-side verification. Merely rendering a widget is not protection. No fake "I am not a robot" checkbox is used. Google OAuth uses the provider's authentication flow.

https://supabase.com/docs/guides/auth/auth-captcha

## 3. Deployment and verification

Build with `npm run build`; launch `npm run server` behind HTTPS. The HTTP development server is not a public production deployment. The app-server endpoint must be same-origin or reverse-proxied. Vite variables are embedded at build time; rebuild after changing them.

Test target Android Chrome and iOS Safari using physical devices, precise location enabled, rear camera selection, screen interruption, loss of connectivity, permission revocation, storage exhaustion, and three-/five-minute limits. Browser tilt APIs and persistence differ across devices. Browser GPS timing is approximate; do not advertise exact frame coordinates.

Run `npm test` for logic tests. `npx playwright test` runs browser flows with synthetic camera/GPS (requires a browser installed; configuration uses system Microsoft Edge). These do not replace real mobile hardware tests or live service verification.
