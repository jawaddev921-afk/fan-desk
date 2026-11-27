import "server-only";
import { singleton } from "./singleton.ts";

/**
 * The only way a lower feature tells a higher one that something happened, so the dependency
 * arrows keep pointing one way (auth, accounts <- inbox <- assistant). Handlers run one after the other and are awaited.
 */
type Events = {
  /** A fan wrote to us. The assistant answers after its debounce delay. */
  "fan:message": [accountId: string, fanId: string, opts: { delayMs?: number }];
  /** The fan is typing: wait a bit longer before answering. */
  "fan:typing": [accountId: string, fanId: string];
  /** The fan now belongs to a human: stop any pending AI work for them. */
  "fan:human": [accountId: string, fanId: string];
  /** The account sent a message (maybe by us, maybe a person in OnlyFans). */
  "account:sent": [accountId: string, fanId: string, msgId: string | null, text: string];
  /** The user removed their OFMAPI key: stop all pending sends for these accounts. */
  "connection:removed": [accountIds: string[]];
};

const handlers = singleton("event-handlers", () => new Map<keyof Events, ((...args: never[]) => unknown)[]>());

export const bus = {
  /** Runs every handler of `name` in order and waits for them (a handler may be async); a handler that throws fails the emitter. */
  async emit<K extends keyof Events>(name: K, ...args: Events[K]): Promise<void> {
    for (const fn of handlers.get(name) ?? []) await (fn as (...a: Events[K]) => unknown)(...args);
  },
  on<K extends keyof Events>(name: K, fn: (...args: Events[K]) => unknown): void {
    handlers.set(name, [...(handlers.get(name) ?? []), fn as (...a: never[]) => unknown]);
  },
};
