# Password reset flow

This app uses a shared password reset flow for web and native, with different redirect handling per platform.

## Web

- `resetPasswordForEmail()` uses `https://<site>/reset-password`
- Recovery URLs are routed internally to `PasswordResetScreen`
- The shared auth provider skips auto-login for recovery/reset URLs
- The deep-link handler ignores recovery links on web so they do not promote a normal session

## Native

- `resetPasswordForEmail()` uses the app scheme redirect
- Recovery links are handled by the native reset screen flow
- Native behavior was kept separate from the web fix

## Notes

- If a web recovery link lands on a non-reset path, the app still checks the full browser URL for recovery tokens.
- The reset screen uses an isolated Supabase client so recovery sessions do not leak into the app-wide auth session.
