// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Autosaver } from './autosave';
import { newStoredWorkspace, type StoredWorkspace } from './port';

const rec = (name: string): StoredWorkspace => ({ ...newStoredWorkspace(name) });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Autosaver (FR-S1 debounce)', () => {
  it('debounces bursts into one trailing save after 800 ms', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = new Autosaver({ save });
    a.schedule(rec('a'));
    await vi.advanceTimersByTimeAsync(400);
    a.schedule(rec('b'));
    await vi.advanceTimersByTimeAsync(400);
    expect(save).not.toHaveBeenCalled(); // first window restarted
    await vi.advanceTimersByTimeAsync(400);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'b' }));
  });

  it('default delay is 800 ms', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = new Autosaver({ save });
    a.schedule(rec('a'));
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush() saves immediately and cancels the pending timer', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = new Autosaver({ save });
    a.schedule(rec('a'));
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1); // timer was cleared
    expect(a.hasPending).toBe(false);
  });

  it('cancel() drops pending state without saving', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = new Autosaver({ save });
    a.schedule(rec('a'));
    a.cancel();
    expect(a.hasPending).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    await a.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps the payload pending when save fails (no data loss)', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('boom'));
    const a = new Autosaver({ save });
    a.schedule(rec('a'));
    await expect(a.flush()).rejects.toMatchObject({ code: 'unavailable' });
    expect(a.hasPending).toBe(true);
    save.mockResolvedValueOnce(undefined);
    await a.flush(); // retry succeeds
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('routes quota failures to onQuota instead of throwing (FR-S3)', async () => {
    const onQuota = vi.fn();
    const save = vi.fn().mockRejectedValue(Object.assign(new Error('q'), { name: 'QuotaExceededError' }));
    const a = new Autosaver({ save, onQuota });
    a.schedule(rec('a'));
    await vi.advanceTimersByTimeAsync(800);
    await Promise.resolve(); // let the rejected promise settle
    expect(onQuota).toHaveBeenCalledTimes(1);
    expect(onQuota).toHaveBeenCalledWith(expect.objectContaining({ code: 'quota' }));
  });
});
