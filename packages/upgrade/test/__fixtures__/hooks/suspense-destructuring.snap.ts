import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useTRPC } from './trpc';

export function Component(channelId: string) {
  const trpc = useTRPC();
  const query = useSuspenseQuery(trpc.post.list.queryOptions());

  const data = query.data;

  const [a, b] = [1, 2];

  const query2 = useSuspenseInfiniteQuery(
    trpc.post.infinite.infiniteQueryOptions(
      { channelId },
      {
        getNextPageParam: (d) => d.nextCursor,
        // No need to refetch as we have a subscription
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    ),
  );

  const query3 = useSuspenseInfiniteQuery(
    trpc.post.infinite.infiniteQueryOptions(
      { channelId },
      {
        getNextPageParam: (d) => d.nextCursor,
      },
    ),
  );

  const data3 = query3.data;

  const { data: data4 } = useSuspenseInfiniteQuery(
    trpc.post.infinite.infiniteQueryOptions(
      { channelId },
      {
        getNextPageParam: (d) => d.nextCursor,
      },
    ),
  );
}
