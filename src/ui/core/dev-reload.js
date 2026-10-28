/**
 * Reloads the window when the dev server restarts.
 *
 * Does nothing unless the server templated dev mode into the page, so the
 * installed app never opens this connection.
 *
 * The signal is the connection itself: `node --watch` restarts the server on
 * any change under src/, the stream drops, EventSource reconnects by itself,
 * and coming back after a drop is what means "there is new code, reload".
 */
export function connectDevReload() {
  if (document.querySelector('meta[name="shopwise-dev"]')?.content !== 'true') return;

  let everConnected = false;
  let lostConnection = false;

  const source = new EventSource('/dev/events');

  source.addEventListener('open', () => {
    if (everConnected && lostConnection) {
      location.reload();
      return;
    }
    everConnected = true;
    lostConnection = false;
  });

  // The server may also push a reload directly.
  source.addEventListener('reload', () => location.reload());

  source.addEventListener('error', () => {
    if (everConnected) lostConnection = true;
  });
}
