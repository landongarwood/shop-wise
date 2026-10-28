'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');
const { EventEmitter } = require('node:events');

const { DevReloadChannel } = require('../../src/http/dev-reload');

/**
 * Live reload, which exists only when the app is started with --dev.
 *
 * It sits outside /api because EventSource cannot send the session token, so
 * the thing that keeps it safe is simply never being constructed in a normal
 * run — covered over in the HTTP tests. What is covered here is that it speaks
 * the event-stream protocol correctly and lets go of a client that leaves.
 */
describe('the dev reload channel', () => {
  const silent = { info() {}, warn() {}, error() {} };

  /** Just enough of a request/response pair to record what was written. */
  const exchange = () => {
    const request = new EventEmitter();
    const response = Object.assign(new EventEmitter(), {
      headers: null,
      chunks: [],
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      write(chunk) {
        this.chunks.push(chunk);
        return true;
      },
    });
    return { request, response };
  };

  // Object.assign copies a getter's value, not the getter, so this is a
  // function rather than a property on the fake.
  const wrote = (response) => response.chunks.join('');

  test('claims its own path and nothing else', () => {
    const channel = new DevReloadChannel({ logger: silent });

    assert.equal(channel.handles('/dev/events'), true);
    assert.equal(channel.handles('/dev/event'), false);
    assert.equal(channel.handles('/api/overview'), false);
    assert.equal(channel.handles('/'), false);
  });

  test('the path can be moved', () => {
    const channel = new DevReloadChannel({ path: '/elsewhere', logger: silent });

    assert.equal(channel.handles('/elsewhere'), true);
    assert.equal(channel.handles('/dev/events'), false);
  });

  test('opens an event stream the browser will hold', () => {
    const channel = new DevReloadChannel({ logger: silent });
    const { request, response } = exchange();

    channel.stream(request, response);

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/event-stream/);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers.connection, 'keep-alive');

    // A short retry, so a restart costs a moment rather than EventSource's
    // several-second default back-off.
    assert.match(wrote(response), /^retry: 250\n\n/);
    assert.match(wrote(response), /event: hello\ndata: \{\}\n\n/);
  });

  test('a reload reaches every page that is listening', () => {
    const channel = new DevReloadChannel({ logger: silent });
    const first = exchange();
    const second = exchange();

    channel.stream(first.request, first.response);
    channel.stream(second.request, second.response);

    channel.broadcast();

    for (const { response } of [first, second]) {
      assert.match(wrote(response), /event: reload\ndata: \{\}\n\n$/);
    }
  });

  test('a page that goes away is forgotten', () => {
    const channel = new DevReloadChannel({ logger: silent });
    const { request, response } = exchange();

    channel.stream(request, response);
    assert.equal(channel.clients.size, 1);

    request.emit('close');
    assert.equal(channel.clients.size, 0);

    const before = wrote(response);
    channel.broadcast();
    assert.equal(wrote(response), before, 'nothing is written to a closed stream');
  });

  test('a stream that errors is dropped too', () => {
    const channel = new DevReloadChannel({ logger: silent });
    const { request, response } = exchange();

    channel.stream(request, response);
    response.emit('error', new Error('socket went away'));

    assert.equal(channel.clients.size, 0);
  });

  test('keeps an idle stream alive with a comment, not an event', async () => {
    const channel = new DevReloadChannel({ logger: silent, keepAliveMs: 5 });
    const { request, response } = exchange();

    channel.stream(request, response);
    await new Promise((resolve) => setTimeout(resolve, 20));
    request.emit('close');

    // A comment frame: the page must not read a heartbeat as a reason to reload.
    assert.match(wrote(response), /: keep-alive\n\n/);
    assert.equal((wrote(response).match(/event: reload/g) ?? []).length, 0);
  });
});
