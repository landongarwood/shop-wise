const token = document.querySelector('meta[name="shopwise-token"]')?.content ?? '';

async function request(method, route, body) {
  const response = await fetch(`/api${route}`, {
    method,
    headers: {
      'x-shopwise-token': token,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }
  return payload;
}

export const api = {
  get: (route) => request('GET', route),
  post: (route, body) => request('POST', route, body),
  patch: (route, body) => request('PATCH', route, body),
  delete: (route) => request('DELETE', route),
};
