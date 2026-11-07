import { describe, expect, it } from 'vitest';
import { HISTORY_CAP, HistoryFeed, undoSurface } from './historyFeed';

describe('HistoryFeed (F-24)', () => {
  it('keeps entries in order and reports the newest first', () => {
    const feed = new HistoryFeed();
    feed.record('canvas', 'move api');
    feed.record('code', 'code edit');
    expect(feed.recent().map((e) => e.label)).toEqual(['code edit', 'move api']);
    expect(feed.last?.surface).toBe('code');
  });

  it('folds a run with the same merge key into one row', () => {
    const feed = new HistoryFeed();
    feed.record('canvas', 'drag 1', 'drag:api');
    feed.record('canvas', 'drag 2', 'drag:api');
    feed.record('canvas', 'drag 3', 'drag:api');
    expect(feed.size).toBe(1);
    expect(feed.last?.label).toBe('drag 3');
  });

  it('starts a new row when the key changes', () => {
    const feed = new HistoryFeed();
    feed.record('canvas', 'drag api', 'drag:api');
    feed.record('canvas', 'drag db', 'drag:db');
    expect(feed.size).toBe(2);
  });

  it('caps the journal', () => {
    const feed = new HistoryFeed();
    for (let i = 0; i < HISTORY_CAP + 5; i += 1) feed.record('canvas', `op ${i}`);
    expect(feed.size).toBe(HISTORY_CAP);
    expect(feed.recent(1)[0]?.label).toBe(`op ${HISTORY_CAP + 4}`);
  });

  it('routes undo by focus, falling back to the last surface', () => {
    expect(undoSurface(true, undefined)).toBe('code');
    expect(undoSurface(false, { surface: 'canvas', label: 'x', seq: 1 })).toBe('canvas');
    expect(undoSurface(false, undefined)).toBe('canvas');
  });
});
