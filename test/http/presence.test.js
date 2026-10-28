'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');
const { EventEmitter } = require('node:events');

const { PresenceChannel } = require('../../src/http/presence');

/**
 * How the app knows a window is open.
 *
 * This is the stream the page holds for as long as it is on screen. The app's
 * decision to keep running hangs on it, so what matters here is that the count
 * of listeners is right and that whoever is watching hears about every change.
 */
describe('the presence channel', () => {
  const silent = { info() {}, warn() {}, error() {} };

  /** Just enough of a request/response pair to record what was written. */
  const exchange = () => {
    const request = new EventEmitter();
    const response = Object.assign(new EventEmitter(), {
      chunks: [],
      ended: false,
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      write(chunk) {
        this.chunks.push(chunk);
        return true;
      },
      end() {
        this.ended = true;
      },
    });
    return { request, response };
  };

  test('claims its own path and nothing else', () => {
    const channel = new PresenceChannel({ logger: silent });

    assert.equal(channel.handles('/alive'), true);
    assert.equal(channel.handles('/alive/'), false);
    assert.equal(channel.handles('/api/overview'), false);
  });

  test('a page that connects is counted', () => {
    const channel = new PresenceChannel({ logger: silent });
    const { request, response } = exchange();

    assert.equal(channel.count, 0);
    channel.stream(request, response);

    assert.equal(channel.count, 1);
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/event-stream/);
  });

  test('closing the window takes the count back to nothing', () => {
    const channel = new PresenceChannel({ logger: silent });
    const first = exchange();
    const second = exchange();

    channel.stream(first.request, first.response);
    channel.stream(second.request, second.response);
    assert.equal(channel.count, 2);

    first.request.emit('close');
    assert.equal(channel.count, 1);

    second.response.emit('error', new Error('socket went away'));
    assert.equal(channel.count, 0);
  });

  test('a page closing twice is only counted once', () => {
    const channel = new PresenceChannel({ logger: silent });
    const { request, response } = exchange();
    const counts = [];
    channel.watch((count) => counts.push(count));

    channel.stream(request, response);
    request.emit('close');
    request.emit('close');
    response.emit('error', new Error('and again'));

    assert.deepEqual(counts, [1, 0]);
  });

  test('whoever is watching hears every change', () => {
    const channel = new PresenceChannel({ logger: silent });
    const counts = [];
    const stop = channel.watch((count) => counts.push(count));

    const first = exchange();
    channel.stream(first.request, first.response);
    const second = exchange();
    channel.stream(second.request, second.response);
    first.request.emit('close');

    assert.deepEqual(counts, [1, 2, 1]);

    stop();
    second.request.emit('close');
    assert.deepEqual(counts, [1, 2, 1], 'nothing more after it stops watching');
  });

  test('shutting down lets go of every stream', () => {
    const channel = new PresenceChannel({ logger: silent });
    const { request, response } = exchange();
    const counts = [];
    channel.watch((count) => counts.push(count));

    channel.stream(request, response);
    channel.closeAll();

    assert.equal(channel.count, 0);
    assert.equal(response.ended, true, 'the socket is released, not just forgotten');
    assert.deepEqual(counts, [1, 0]);
  });
});
