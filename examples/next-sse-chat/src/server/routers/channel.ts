import EventEmitter, { on } from 'node:events';
import type { TRPCRouterRecord } from '@trpc/server';
import { db } from '~/server/db/client';
import type { PostType } from '~/server/db/schema';
import { Channel } from '~/server/db/schema';
import { authedProcedure, publicProcedure } from '~/server/trpc';
import { z } from 'zod';

export type WhoIsTyping = Record<string, { lastTyped: Date }>;

type EventMap<T> = Record<keyof T, any[]>;
class IterableEventEmitter<T extends EventMap<T>> extends EventEmitter<T> {
  toIterable<TEventName extends keyof T & string>(
    eventName: TEventName,
    opts?: NonNullable<Parameters<typeof on>[2]>,
  ): AsyncIterable<T[TEventName]> {
    return on(this as any, eventName, opts) as any;
  }
}

export interface MyEvents {
  add: [channelId: string, data: PostType];
  isTypingUpdate: [channelId: string, who: WhoIsTyping];
}

// In a real app, you'd probably use Redis or something
export const ee = new IterableEventEmitter<MyEvents>();

// who is currently typing for each channel, key is `name`
export const currentlyTyping: Record<string, WhoIsTyping> = Object.create(null);

// every 1s, clear old "isTyping"
setInterval(() => {
  const updatedChannels = new Set<string>();
  const now = Date.now();
  for (const [channelId, typers] of Object.entries(currentlyTyping)) {
    for (const [key, value] of Object.entries(typers ?? {})) {
      if (now - value.lastTyped.getTime() > 3e3) {
        delete typers[key];
        updatedChannels.add(channelId);
      }
    }
  }
  updatedChannels.forEach((channelId) => {
    ee.emit('isTypingUpdate', channelId, currentlyTyping[channelId] ?? {});
  });
}, 3e3).unref();

export const channelRouter = {
  list: publicProcedure.query(() => {
    return db.query.Channel.findMany();
  }),

  create: authedProcedure
    .input(z.object({ name: z.string().trim().min(2) }))
    .mutation(async ({ ctx, input }) => {
      const [channel] = await db
        .insert(Channel)
        .values({
          name: input.name,
        })
        .returning();

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return channel!.id;
    }),

  isTyping: authedProcedure
    .input(z.object({ channelId: z.string().uuid(), typing: z.boolean() }))
    .mutation(async (opts) => {
      const { name } = opts.ctx.user;
      const { channelId } = opts.input;

      currentlyTyping[channelId] ??= {};

      if (!opts.input.typing) {
        delete currentlyTyping[channelId][name];
      } else {
        currentlyTyping[channelId][name] = {
          lastTyped: new Date(),
        };
      }
      ee.emit('isTypingUpdate', channelId, currentlyTyping[channelId]);
    }),

  whoIsTyping: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
      }),
    )
    .subscription(async function* (opts) {
      const { channelId } = opts.input;

      let lastIsTyping = '';

      /**
       * yield who is typing if it has changed
       * won't yield if it's the same as last time
       */
      function* maybeYield(who: WhoIsTyping) {
        const idx = Object.keys(who).toSorted().toString();
        if (idx === lastIsTyping) {
          return;
        }
        yield Object.keys(who);

        lastIsTyping = idx;
      }

      // emit who is currently typing
      yield* maybeYield(currentlyTyping[channelId] ?? {});

      for await (const [channelId, who] of ee.toIterable('isTypingUpdate', {
        signal: opts.signal,
      })) {
        if (channelId === opts.input.channelId) {
          yield* maybeYield(who);
        }
      }
    }),
} satisfies TRPCRouterRecord;
