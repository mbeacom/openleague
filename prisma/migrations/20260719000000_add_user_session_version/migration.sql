-- Session revocation for the JWT strategy.
--
-- Auth.js uses stateless JWT sessions (7-day maxAge), so before this change a
-- password reset / change / email change could not evict an already-issued
-- session cookie — a hijacked session survived account recovery until the JWT
-- expired. "sessionVersion" is embedded in the JWT at sign-in and re-checked
-- (throttled) in the jwt callback; bumping it on those flows invalidates every
-- outstanding session. Defaults to 0 so existing rows are unaffected.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
