* Return/redirect to login page when unauthorized
* Handle too large of upload JSON.
* Don't allow setting public owners (and maybe managers).
* PUT debugging notes
  * Seems to work when authenticated
  * When not authenticated, returns 403 for small files, but hangs on big
    files. If you try a big file first, small files hang behind them.
  * I'm guessing the problem has something to do with cancellation.
* Add ability to have the server return the hash of a specific file, in order
  to implement things like syncing?
  * This might be better left to the application layer, ie when uploading
    large files, the uploader should generative the hashes and store them
    alongside the files.
* Implement maxUses for tokens
  * This could be tricky. Would probably require a link chain to parent tokens.
* Is the implementation of expiresAt = createdAt + maxAge secure? If something
  weird happens with leap seconds could the user create a token that lives
  longer than it should?
* Add token URL parameter for creating "signed" URLs.
  * Postponed for now in favor of shortlived tokens.
* Implement informing user token is expired. Requires keeping tokens around for
  a while.
* Make token perms and instance perms use same data model?
  * Would cut down on perm-checking code
  * Doesn't look as clean in pauth_perms.json, but might be worth it.
* Implement manual token deletion
* Implement automatic token deletion
