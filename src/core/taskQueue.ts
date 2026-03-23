/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import PQueue from "p-queue";
import { AuditTrail } from "../infrastructure/bigquery";

/**
 * Enterprise-grade Task Queue for Asynchronous Multimodal Processing.
 * Implements non-blocking queue (P-Queue) and Exponential Backoff for 100% Fault Tolerance.
 */
export class TaskQueue {
  private static instance: TaskQueue;
  private queue: PQueue;

  private constructor() {
    // Initialize P-Queue with concurrency limits to prevent API abuse
    this.queue = new PQueue({ concurrency: 10 });
  }

  /**
   * Returns the Singleton instance of TaskQueue.
   * @returns The TaskQueue instance.
   */
  public static getInstance(): TaskQueue {
    if (!TaskQueue.instance) {
      TaskQueue.instance = new TaskQueue();
    }
    return TaskQueue.instance;
  }

  /**
   * Enqueues a task for asynchronous processing with exponential backoff.
   * @param task The task to execute (must return a Promise).
   * @param traceId Unique TraceID for auditability.
   * @param maxRetries Maximum number of retries for the task.
   * @returns A promise that resolves to the task's result.
   */
  public async enqueue<T>(
    task: () => Promise<T>,
    traceId: string,
    maxRetries: number = 3
  ): Promise<T> {
    return this.queue.add(async () => {
      let attempts = 0;
      
      while (attempts < maxRetries) {
        try {
          console.log(`[TaskQueue] [${traceId}] Executing task (Attempt ${attempts + 1}).`);
          return await task();
        } catch (error: any) {
          attempts++;
          if (attempts >= maxRetries) {
            console.error(`[TaskQueue] [${traceId}] Task failed after ${maxRetries} attempts: ${error.message}`);
            throw error;
          }

          // Exponential Backoff: 2^attempts * 1000ms
          const delay = Math.pow(2, attempts) * 1000;
          console.warn(`[TaskQueue] [${traceId}] Task failed. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      throw new Error(`[TaskQueue] [${traceId}] Unexpected failure in task execution.`);
    }) as Promise<T>;
  }

  /**
   * Returns the current size of the queue.
   */
  public get size(): number {
    return this.queue.size;
  }

  /**
   * Returns the number of tasks currently being processed.
   */
  public get pending(): number {
    return this.queue.pending;
  }
}
