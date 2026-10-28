/**
 * The only place the UI talks to the server.
 *
 * The token comes from a meta tag the server wrote into the page. It is not a
 * login — there are no accounts and nothing to sign into. It stops a random
 * website the user has open from posting into the shop's books behind their
 * back, since this app listens on a local port while it is running.
 */
export class ApiClient {
  constructor({ token = readToken(), base = '/api' } = {}) {
    this.token = token;
    this.base = base;
  }

  get(route) {
    return this.#request('GET', route);
  }

  post(route, body) {
    return this.#request('POST', route, body);
  }

  patch(route, body) {
    return this.#request('PATCH', route, body);
  }

  delete(route) {
    return this.#request('DELETE', route);
  }

  async #request(method, route, body) {
    let response;
    try {
      response = await fetch(`${this.base}${route}`, {
        method,
        headers: {
          'x-shopwise-token': this.token,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new Error('Lost contact with ShopWise. Close the window and open it again.', { cause });
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(payload?.error ?? `Something went wrong (${response.status}).`);
      error.status = response.status;
      error.code = payload?.code;
      throw error;
    }
    return payload;
  }
}

function readToken() {
  return document.querySelector('meta[name="shopwise-token"]')?.content ?? '';
}
