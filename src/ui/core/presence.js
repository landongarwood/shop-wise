/**
 * Tells the app that this window is open.
 *
 * The stream stays open for as long as the page is on screen and ends when the
 * window is closed, which is how the app knows to keep running and when to
 * stop. Nothing is ever sent over it in either direction; the connection
 * itself is the whole message. EventSource reconnects on its own, so a reload
 * or a hiccup looks like a brief gap rather than a closed window.
 */
export function announcePresence() {
  try {
    return new EventSource('/alive');
  } catch {
    // A browser without EventSource would simply be unable to say it is here.
    return null;
  }
}
