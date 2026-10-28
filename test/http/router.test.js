'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { Router } = require('../../src/http/router');

/** Method-and-path matching, and the shape handlers may answer in. */
describe('the router', () => {
  const dispatch = (router, method, pathname, extras = {}) =>
    router.dispatch({ method, pathname, query: new URLSearchParams(), body: undefined, ...extras });

  test('matches a plain path and wraps the result as 200', async () => {
    const router = new Router().get('/health', () => ({ ok: true }));

    assert.deepEqual(await dispatch(router, 'GET', '/health'), { status: 200, payload: { ok: true } });
  });

  test('a handler may set its own status', async () => {
    const router = new Router().post('/products', () => ({ status: 201, payload: { id: 'p1' } }));

    assert.deepEqual(await dispatch(router, 'POST', '/products'), { status: 201, payload: { id: 'p1' } });
  });

  test('a handler returning nothing is still a valid answer', async () => {
    const router = new Router().get('/nothing', () => undefined);

    assert.deepEqual(await dispatch(router, 'GET', '/nothing'), { status: 200, payload: null });
  });

  test('captures parameters and decodes them', async () => {
    const router = new Router().get('/customers/:id/statement', ({ params }) => params);

    assert.deepEqual((await dispatch(router, 'GET', '/customers/c1/statement')).payload, { id: 'c1' });
    assert.deepEqual(
      (await dispatch(router, 'GET', `/customers/${encodeURIComponent('a b/c')}/statement`)).payload,
      { id: 'a b/c' },
      'an id with awkward characters survives the round trip'
    );
  });

  test('captures more than one parameter', async () => {
    const router = new Router().get('/a/:one/b/:two', ({ params }) => params);

    assert.deepEqual((await dispatch(router, 'GET', '/a/1/b/2')).payload, { one: '1', two: '2' });
  });

  test('the method is part of the match', async () => {
    const router = new Router()
      .get('/products', () => 'listed')
      .post('/products', () => 'created')
      .patch('/products/:id', () => 'patched')
      .delete('/products/:id', () => 'deleted');

    assert.equal((await dispatch(router, 'GET', '/products')).payload, 'listed');
    assert.equal((await dispatch(router, 'POST', '/products')).payload, 'created');
    assert.equal((await dispatch(router, 'PATCH', '/products/p1')).payload, 'patched');
    assert.equal((await dispatch(router, 'DELETE', '/products/p1')).payload, 'deleted');
    await assert.rejects(() => dispatch(router, 'PUT', '/products'), /No such endpoint: PUT/);
  });

  test('a literal segment beats a parameter at the same depth', async () => {
    const router = new Router().get('/stock/low', () => 'literal').get('/stock/:id', () => 'parameter');

    assert.equal((await dispatch(router, 'GET', '/stock/low')).payload, 'literal');
    assert.equal((await dispatch(router, 'GET', '/stock/p1')).payload, 'parameter');
  });

  test('depth matters, so a longer path is not swallowed by a shorter route', async () => {
    const router = new Router().get('/products', () => 'list').get('/products/:id', () => 'one');

    assert.equal((await dispatch(router, 'GET', '/products')).payload, 'list');
    assert.equal((await dispatch(router, 'GET', '/products/p1')).payload, 'one');
    await assert.rejects(() => dispatch(router, 'GET', '/products/p1/extra'), /No such endpoint/);
  });

  test('trailing and doubled slashes do not change the route', async () => {
    const router = new Router().get('/products/:id', ({ params }) => params.id);

    assert.equal((await dispatch(router, 'GET', '/products/p1/')).payload, 'p1');
    assert.equal((await dispatch(router, 'GET', '//products//p1')).payload, 'p1');
  });

  test('an unknown endpoint is a 404 the user could be shown', async () => {
    const router = new Router();

    await assert.rejects(() => dispatch(router, 'GET', '/nope'), (error) => {
      assert.equal(error.status, 404);
      assert.equal(error.expose, true);
      assert.match(error.message, /No such endpoint: GET \/nope/);
      return true;
    });
  });

  test('query and body are handed to the handler untouched', async () => {
    const router = new Router().post('/sales', ({ query, body }) => ({ limit: query.get('limit'), body }));

    const result = await dispatch(router, 'POST', '/sales', {
      query: new URLSearchParams('limit=5'),
      body: { items: [1] },
    });

    assert.deepEqual(result.payload, { limit: '5', body: { items: [1] } });
  });

  test('an async handler is awaited', async () => {
    const router = new Router().get('/slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 'eventually';
    });

    assert.equal((await dispatch(router, 'GET', '/slow')).payload, 'eventually');
  });

  test('a handler that throws is left to the caller to present', async () => {
    const router = new Router().get('/boom', () => {
      throw Object.assign(new Error('nope'), { status: 409 });
    });

    await assert.rejects(() => dispatch(router, 'GET', '/boom'), (error) => {
      assert.equal(error.status, 409);
      return true;
    });
  });

  test('registering returns the router, so routes chain', () => {
    const router = new Router();
    assert.equal(router.get('/a', () => 1), router);
  });
});
