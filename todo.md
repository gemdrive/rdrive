* Add download button to UI to allow downloads using current token. Launching
  out to external link doesn't work for permissioned files.
* Add token URL parameter for creating "signed" URLs.
* Handle too large of upload JSON.
* Don't allow setting public owners (and maybe managers).
* PUT debugging notes
  * Seems to work when authenticated
  * When not authenticated, returns 403 for small files, but hangs on big
    files. If you try a big file first, small files hang behind them.
  * I'm guessing the problem has something to do with cancellation.
