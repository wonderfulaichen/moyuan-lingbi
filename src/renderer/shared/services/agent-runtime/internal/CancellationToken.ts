/**
 * CancellationToken
 *
 * 基于 AbortController 的取消信号封装，用于安全中断正在执行的步骤。
 *
 * 设计原则：
 * - 取消作为一等公民：每一步都必须检查 AbortSignal
 * - 安全的竞态处理：取消和执行的时序竞争通过 Promise.race 解决
 * - 幂等性：多次调用 cancel() 只生效一次
 *
 * 使用场景：
 * - AgentRuntime.cancel() → AbortController.abort()
 * - 正在执行的 LLM 调用通过 AbortSignal 中断
 * - 正在等待的重试 delay 通过 signal 立即 resolve
 * - 后续未开始的步骤通过检查 signal.aborted 跳过
 */

// ============================================================
// 自定义错误类型
// ============================================================

/**
 * 操作已被取消的错误
 */
export class CancelledError extends Error {
  constructor(message = '操作已被取消') {
    super(message);
    this.name = 'CancelledError';
  }
}

// ============================================================
// CancellationToken
// ============================================================

/**
 * 取消令牌封装
 *
 * 提供比原始 AbortController 更友好的 API：
 * - isCancelled: 是否已取消（只读属性，比 signal.aborted 更语义化）
 * - throwIfCancelled(): 如果已取消则抛出 CancelledError
 * - onCancelled: 取消时的回调注册
 */
export class CancellationToken {
  /** 内部的 AbortController */
  private controller: AbortController;

  /** 取消时的回调列表 */
  private callbacks: Array<() => void> = [];

  constructor() {
    this.controller = new AbortController();
  }

  /**
   * 获取底层的 AbortSignal
   *
   * 适用于传递给 fetch、aiService 等原生支持 AbortSignal 的 API。
   */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * 是否已取消
   */
  get isCancelled(): boolean {
    return this.controller.signal.aborted;
  }

  /**
   * 触发取消
   *
   * 幂等：多次调用只生效一次。
   * 会触发所有已注册的回调，然后调用 AbortController.abort()。
   */
  cancel(): void {
    if (this.isCancelled) return;

    // 触发回调（在 abort 之前，确保回调能执行清理）
    for (const cb of this.callbacks) {
      try {
        cb();
      } catch {
        // 忽略回调中的错误
      }
    }

    this.controller.abort();
  }

  /**
   * 如果已取消则抛出 CancelledError
   *
   * 在工作流程的关键检查点调用。
   *
   * @param message - 可选的错误信息
   * @throws CancelledError
   */
  throwIfCancelled(message?: string): void {
    if (this.isCancelled) {
      throw new CancelledError(message);
    }
  }

  /**
   * 注册取消回调
   *
   * @param callback - 取消时执行的回调函数
   * @returns 取消注册的函数
   */
  onCancelled(callback: () => void): () => void {
    this.callbacks.push(callback);

    // 返回取消注册的函数
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index >= 0) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * 创建一个新的 CancellationToken，但链接到当前 token
   *
   * 子 token 被取消时不会影响父 token。
   * 父 token 被取消时，所有子 token 也会被取消。
   */
  createLinkedToken(): CancellationToken {
    const childToken = new CancellationToken();

    // 如果父 token 已经取消，立即取消子 token
    if (this.isCancelled) {
      childToken.cancel();
      return childToken;
    }

    // 父 token 取消时，自动取消子 token
    this.onCancelled(() => {
      childToken.cancel();
    });

    return childToken;
  }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 带取消支持的延迟函数
 *
 * 在等待期间如果 signal 被触发，立即 resolve（相当于跳过延迟）。
 * 使用 Promise.race 实现，不会抛出错误。
 *
 * @param ms - 延迟毫秒数
 * @param signal - 可选的取消信号
 * @returns 是否正常完成（true = 正常延迟结束，false = 被取消打断）
 */
export function delay(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }

    const timerId = setTimeout(() => {
      cleanup();
      resolve(true);
    }, ms);

    const onAbort = () => {
      clearTimeout(timerId);
      resolve(false);
    };

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
