/**
 * CancellationToken 单元测试
 *
 * 测试目标：
 * - 取消信号的创建、触发、幂等性
 * - throwIfCancelled 的异常抛出行为
 * - onCancelled 回调注册与取消
 * - createLinkedToken 父子级联取消
 * - delay 函数的取消感知行为
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CancellationToken, CancelledError, delay } from './CancellationToken';

describe('CancellationToken', () => {
  let token: CancellationToken;

  beforeEach(() => {
    token = new CancellationToken();
  });

  describe('初始状态', () => {
    it('创建后 should not be cancelled', () => {
      expect(token.isCancelled).toBe(false);
      expect(token.signal.aborted).toBe(false);
    });

    it('signal should be an AbortSignal', () => {
      expect(token.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('cancel()', () => {
    it('取消后 isCancelled 应为 true', () => {
      token.cancel();
      expect(token.isCancelled).toBe(true);
      expect(token.signal.aborted).toBe(true);
    });

    it('多次调用 cancel() 应幂等', () => {
      token.cancel();
      token.cancel();
      token.cancel();
      expect(token.isCancelled).toBe(true);
    });
  });

  describe('throwIfCancelled()', () => {
    it('未取消时不应抛出', () => {
      expect(() => token.throwIfCancelled()).not.toThrow();
    });

    it('已取消时应抛出 CancelledError', () => {
      token.cancel();
      expect(() => token.throwIfCancelled()).toThrow(CancelledError);
    });

    it('throwIfCancelled 应使用传入的自定义消息', () => {
      token.cancel();
      expect(() => token.throwIfCancelled('自定义取消消息')).toThrow('自定义取消消息');
    });
  });

  describe('onCancelled()', () => {
    it('注册的回调应在取消时被调用', () => {
      const callback = vi.fn();
      token.onCancelled(callback);
      expect(callback).not.toHaveBeenCalled();
      token.cancel();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('返回的取消注册函数应能移除回调', () => {
      const callback = vi.fn();
      const unregister = token.onCancelled(callback);
      unregister();
      token.cancel();
      expect(callback).not.toHaveBeenCalled();
    });

    it('多个回调应按注册顺序执行', () => {
      const order: number[] = [];
      token.onCancelled(() => order.push(1));
      token.onCancelled(() => order.push(2));
      token.onCancelled(() => order.push(3));
      token.cancel();
      expect(order).toEqual([1, 2, 3]);
    });

    it('回调中的异常不应阻止其他回调执行', () => {
      const callback1 = vi.fn(() => { throw new Error('cb1 error'); });
      const callback2 = vi.fn();
      token.onCancelled(callback1);
      token.onCancelled(callback2);
      expect(() => token.cancel()).not.toThrow();
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('createLinkedToken()', () => {
    it('子 token 取消不应影响父 token', () => {
      const child = token.createLinkedToken();
      child.cancel();
      expect(child.isCancelled).toBe(true);
      expect(token.isCancelled).toBe(false);
    });

    it('父 token 取消应级联取消子 token', () => {
      const child = token.createLinkedToken();
      token.cancel();
      expect(child.isCancelled).toBe(true);
    });

    it('如果父 token 已经取消，创建的链接 token 应立即可用', () => {
      token.cancel();
      const child = token.createLinkedToken();
      expect(child.isCancelled).toBe(true);
    });

    it('多个子 token 应全部随父 token 取消', () => {
      const child1 = token.createLinkedToken();
      const child2 = token.createLinkedToken();
      const child3 = token.createLinkedToken();
      token.cancel();
      expect(child1.isCancelled).toBe(true);
      expect(child2.isCancelled).toBe(true);
      expect(child3.isCancelled).toBe(true);
    });
  });
});

describe('delay()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('正常延迟后应 resolve(true)', async () => {
    const promise = delay(100);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBe(true);
  });

  it('没有 signal 时应正常延迟', async () => {
    const promise = delay(50);
    vi.advanceTimersByTime(50);
    await expect(promise).resolves.toBe(true);
  });

  it('如果 signal 已 abort，应立即 resolve(false)', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await delay(1000, controller.signal);
    expect(result).toBe(false);
  });

  it('如果 delay 期间 signal 被 abort，应立即 resolve(false)', async () => {
    const controller = new AbortController();
    const promise = delay(10000, controller.signal);
    controller.abort();
    // 使用微任务等待 promise 解析
    await expect(promise).resolves.toBe(false);
  });

  it('cancel 后不应调用 setTimeout', async () => {
    const spy = vi.spyOn(globalThis, 'clearTimeout');
    const controller = new AbortController();
    const promise = delay(10000, controller.signal);
    controller.abort();
    await promise;
    expect(spy).toHaveBeenCalled();
  });
});
