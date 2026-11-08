# TRY-REAL: real sign-in in coil, verified through sleep/wake

Sign in to a real site by hand once inside coil's browser. Coil keeps the
session in the sealed cookie jar, so it survives the thread sleeping and
waking. This file records the receipt afterwards.

## Steps

1. Open coil.coey.dev and sign in (Cloudflare OAuth) as usual.
2. Open a thread, then open a real site in its browser (any site with a
   sign-in page you use).
3. Sign in by hand. Coil does not type credentials; you do.
4. Sleep the thread (Pause). Wake it. Reopen the same site. You should
   still be signed in; the cookies were saved sealed on pause and
   restored on wake.
5. Report the site and the receipt lines below.

## Receipt

- Site: (pending Jordan)
- Signed in by hand: (pending)
- Survived pause/wake: (pending)
- Date: (pending)
