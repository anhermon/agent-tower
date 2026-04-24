import { RedisMemoryServer } from "redis-memory-server";
import type { Queue, Worker } from "bullmq";

let redisServer: RedisMemoryServer | undefined;

export async function startTestRedis(): Promise<{ host: string; port: number }> {
  if (!redisServer) {
    redisServer = new RedisMemoryServer();
  }
  const host = await redisServer.getHost();
  const port = await redisServer.getPort();
  return { host, port };
}

export async function stopTestRedis(): Promise<void> {
  if (redisServer) {
    await redisServer.stop();
    redisServer = undefined;
  }
}

export async function drainQueue(queue: Queue<unknown>): Promise<void> {
  await queue.drain();
}

export async function closeWorker(worker: Worker<unknown>): Promise<void> {
  await worker.close();
}
