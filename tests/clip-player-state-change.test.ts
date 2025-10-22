import test from 'node:test';
import assert from 'node:assert/strict';

import { createHandleStateChangeHandler } from '../frontend/src/components/clipPlayerStateChange';

test('handleStateChange invokes onEnded when event data is 0 and window.YT is undefined', () => {
  const globalObject = globalThis as { window?: unknown };
  const previousWindow = globalObject.window;
  try {
    Object.defineProperty(globalObject, 'window', {
      configurable: true,
      value: {}
    });

    let endedCalls = 0;
    const onEnded = () => {
      endedCalls += 1;
    };

    const handler = createHandleStateChangeHandler({
      startSec: 0,
      endSec: undefined,
      shouldLoop: false,
      onEnded
    });

    handler({
      data: 0,
      target: {
        seekTo: () => {
          throw new Error('seekTo should not be called when not looping');
        },
        playVideo: () => {
          throw new Error('playVideo should not be called when not looping');
        },
        pauseVideo: () => {
          throw new Error('pauseVideo should not be called when not looping');
        }
      }
    } as never);

    assert.equal(endedCalls, 1, 'onEnded should be invoked exactly once when event data is 0');
  } finally {
    if (previousWindow === undefined) {
      delete globalObject.window;
    } else {
      Object.defineProperty(globalObject, 'window', {
        configurable: true,
        value: previousWindow
      });
    }
  }
});
