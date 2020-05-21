* Think more deeply about whether using POST is enough to ensure
  delegate-auth-code is secure.
* Handle case where it tries to delegate with the old invalid cookie
* Implmenet state parameter
* Implement PKCE
* Make auth codes expire
* Return/redirect to login page when unauthorized
* Don't allow setting public owners (and maybe managers).
* Implement informing user token is expired. Requires keeping tokens around for
  a while.
* Make token perms and instance perms use same data model?
  * Would cut down on perm-checking code
  * Doesn't look as clean in pauth_perms.json, but might be worth it.
* Implement manual token deletion
* Maybe implement maxUses for tokens
  * This could be tricky. Would probably require a link chain to parent tokens.
* Is the implementation of expiresAt = createdAt + maxAge secure? If something
  weird happens with leap seconds could the user create a token that lives
  longer than it should?
* Detect login connection closed before verification completes. req.on('close')
* Implement refresh tokens?
  * Delegate tokens seem more powerful, but the nice thing about refresh tokens
    is there's less incentive to send them places they shouldn't be, since
    they're only good for getting access tokens.
* Fix case where redirect_uri doesn't already have query params, ie can't
  assume &code= is ok to append.
