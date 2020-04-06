* Add token URL parameter for creating "signed" URLs.
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
