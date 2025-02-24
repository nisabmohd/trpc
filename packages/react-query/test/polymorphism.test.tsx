/*
  It's common to have a data interface which is used across multiple routes in an API,
  for instance a shared CSV Export system which can be applied to multiple entities in an application.

  By default this can present a challenge in tRPC clients, because the @trpc/react-query package 
  produces router interfaces which are not always considered structurally compatible by typescript.

  The polymorphism types can be used to generate abstract types which routers sharing a common 
  interface are compatible with, and allow you to pass around deep router paths to generic components with ease.
*/

import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getUntypedClient } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { InferQueryLikeData } from '@trpc/react-query/shared';
import { konn } from 'konn';
import type { ReactNode } from 'react';
import React, { useState } from 'react';
import { z } from 'zod';
import { t } from './polymorphism.common';
/**
 * We define a router factory which can be used many times.
 *
 * This also exports types generated by RouterLike and UtilsLike to describe
 * interfaces which concrete router instances are compatible with
 */
import * as Factory from './polymorphism.factory';
/**
 * We also define a factory which extends from the basic Factory with an entity sub-type and extra procedure
 */
import * as SubTypedFactory from './polymorphism.subtyped-factory';

/**
 * The tRPC backend is defined here
 */
function createTRPCApi() {
  /**
   * Backend data sources.
   *
   * Here we use a simple array for demonstration, but in practice these might be
   * an ORM Repository, a microservice's API Client, etc. Whatever you write your own router factory around.
   */
  const IssueExportsProvider: Factory.FileExportStatusType[] = [];
  const DiscussionExportsProvider: Factory.FileExportStatusType[] = [];
  const PullRequestExportsProvider: SubTypedFactory.SubTypedFileExportStatusType[] =
    [];

  /**
   * Create an AppRouter instance, with multiple routes using the data export interface
   */
  const appRouter = t.router({
    github: t.router({
      issues: t.router({
        export: Factory.createExportRoute(t.procedure, IssueExportsProvider),
      }),
      discussions: t.router({
        export: t.mergeRouters(
          Factory.createExportRoute(t.procedure, DiscussionExportsProvider),

          // We want to be sure that routers with abstract types,
          //  which then get merged into a larger router, can be used polymorphically
          t.router({
            someExtraProcedure: t.procedure
              .input(z.object({ name: z.string().min(0) }))
              .mutation((opts) => {
                return 'Hello ' + opts.input.name;
              }),
          }),
        ),
      }),
      pullRequests: t.router({
        export: SubTypedFactory.createSubTypedExportRoute(
          t.procedure,
          PullRequestExportsProvider,
        ),
      }),
    }),
  });

  return {
    t,
    appRouter,
    IssueExportsProvider,
    DiscussionExportsProvider,
    PullRequestExportsProvider,
  };
}

describe('polymorphism', () => {
  /**
   * Test setup
   */
  const ctx = konn()
    .beforeEach(() => {
      const {
        appRouter,
        IssueExportsProvider,
        DiscussionExportsProvider,
        PullRequestExportsProvider,
      } = createTRPCApi();

      const opts = testServerAndClientResource(appRouter);
      const trpc = createTRPCReact<typeof appRouter>();

      const queryClient = new QueryClient();

      function App(props: { children: ReactNode }) {
        return (
          <trpc.Provider
            {...{ queryClient, client: getUntypedClient(opts.client) }}
          >
            <QueryClientProvider client={queryClient}>
              {props.children}
            </QueryClientProvider>
          </trpc.Provider>
        );
      }
      return {
        ...opts,
        App,
        trpc,
        IssueExportsProvider,
        DiscussionExportsProvider,
        PullRequestExportsProvider,
      };
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  describe('simple factory', () => {
    test('can use a simple factory router with an abstract interface', async () => {
      const { trpc } = ctx;

      /**
       * Can now define page components which re-use functionality from components,
       * and pass the specific backend functionality which is needed need
       */
      function IssuesExportPage() {
        const utils = trpc.useUtils();

        const [currentExport, setCurrentExport] = useState<number | null>(null);

        const invalidate = useMutation({
          mutationFn: () => utils.invalidate(),
        });
        return (
          <>
            <StartExportButton
              route={trpc.github.issues.export}
              utils={utils.github.issues.export}
              onExportStarted={setCurrentExport}
            />

            <RefreshExportsListButton
              mutate={invalidate.mutate}
              isPending={invalidate.isPending}
            />

            <ExportStatus
              status={trpc.github.issues.export.status}
              currentExport={currentExport}
            />

            <ExportsList list={trpc.github.issues.export.list} />
          </>
        );
      }

      /**
       * Test Act & Assertions
       */

      const $ = render(
        <ctx.App>
          <IssuesExportPage />
        </ctx.App>,
      );

      await userEvent.click($.getByTestId('startExportBtn'));

      await waitFor(() => {
        expect($.container).toHaveTextContent(
          'Last Export: `Search for Polymorphism React` (Working)',
        );
      });

      await userEvent.click($.getByTestId('refreshBtn'));

      await waitFor(() => {
        expect($.container).toHaveTextContent(
          'Last Export: `Search for Polymorphism React` (Ready!)',
        );
      });
    });

    test('can use the abstract interface with a factory instance which has been merged with some extra procedures', async () => {
      const { trpc } = ctx;

      function DiscussionsExportPage() {
        const utils = trpc.useUtils();

        const [currentExport, setCurrentExport] = useState<number | null>(null);
        const invalidate = useMutation({
          mutationFn: () => utils.invalidate(),
        });

        return (
          <>
            <StartExportButton
              route={trpc.github.discussions.export}
              utils={utils.github.discussions.export}
              onExportStarted={setCurrentExport}
            />

            <RefreshExportsListButton
              mutate={invalidate.mutate}
              isPending={invalidate.isPending}
            />

            <ExportStatus
              status={trpc.github.discussions.export.status}
              currentExport={currentExport}
            />

            <ExportsList list={trpc.github.discussions.export.list} />
          </>
        );
      }

      /**
       * Test Act & Assertions
       */

      const $ = render(
        <ctx.App>
          <DiscussionsExportPage />
        </ctx.App>,
      );

      await userEvent.click($.getByTestId('startExportBtn'));

      await waitFor(() => {
        expect($.container).toHaveTextContent(
          'Last Export: `Search for Polymorphism React` (Working)',
        );
      });

      await userEvent.click($.getByTestId('refreshBtn'));

      await waitFor(() => {
        expect($.container).toHaveTextContent(
          'Last Export: `Search for Polymorphism React` (Ready!)',
        );
      });
    });
  });

  describe('sub-typed factory', () => {
    test('can use a sub-typed factory router with the interfaces from the supertype', async () => {
      const { trpc } = ctx;

      /**
       * Can define page components which operate over interfaces generated by a super-typed router,
       * but also extend types and functionality
       */
      function PullRequestsExportPage() {
        const utils = trpc.useUtils();

        const [currentExport, setCurrentExport] = useState<number | null>(null);
        const invalidate = useMutation({
          mutationFn: () => utils.invalidate(),
        });

        return (
          <>
            {/* Some components may still need to be bespoke... */}
            <SubTypedStartExportButton
              route={trpc.github.pullRequests.export}
              utils={utils.github.pullRequests.export}
              onExportStarted={setCurrentExport}
            />

            <RefreshExportsListButton
              mutate={invalidate.mutate}
              isPending={invalidate.isPending}
            />

            <RemoveExportButton
              remove={trpc.github.pullRequests.export.delete}
              utils={utils.github.pullRequests.export}
              exportId={currentExport}
            />

            {/* ... or you can adapt them to support sub-types */}
            <ExportStatus
              status={trpc.github.pullRequests.export.status}
              //                                       ^?
              currentExport={currentExport}
              renderAdditionalFields={(data) => {
                expectTypeOf(data.description).toBeString();
                return `Description: "${data?.description}"`;
              }}
            />

            <ExportsList list={trpc.github.pullRequests.export.list} />
          </>
        );
      }

      /**
       * Test Act & Assertions
       */

      const $ = render(
        <ctx.App>
          <PullRequestsExportPage />
        </ctx.App>,
      );

      await userEvent.click($.getByTestId('startExportBtn'));

      await waitFor(() => {
        expect($.container).toHaveTextContent(
          'Last Export: `Search for Polymorphism React` (Working)',
        );
      });

      await userEvent.click($.getByTestId('refreshBtn'));

      await waitFor(() => {
        expect($.container).toHaveTextContent(
          'Last Export: `Search for Polymorphism React` (Ready!)',
        );
      });
    });
  });
});

/**
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * General use components which can consume any matching route interface
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 */

function StartExportButton(props: {
  route: Factory.ExportRouteLike;
  utils: Factory.ExportUtilsLike;
  onExportStarted: (id: number) => void;
}) {
  const exportStarter = props.route.start.useMutation({
    async onSuccess(data) {
      props.onExportStarted(data.id);

      await props.utils.invalidate();
    },
  });

  return (
    <button
      data-testid="startExportBtn"
      onClick={() => {
        exportStarter.mutateAsync({
          filter: 'polymorphism react',
          name: 'Search for Polymorphism React',
        });
      }}
    >
      Start Export
    </button>
  );
}

function RemoveExportButton(props: {
  exportId: number | null;
  remove: SubTypedFactory.ExportSubTypedRouteLike['delete'];
  utils: SubTypedFactory.ExportSubTypesUtilsLike;
}) {
  const exportDeleter = props.remove.useMutation({
    async onSuccess() {
      await props.utils.invalidate();
    },
  });

  const id = props.exportId;
  if (!id) {
    return null;
  }

  return (
    <button
      data-testid="removeExportBtn"
      onClick={() => {
        exportDeleter.mutateAsync({
          id,
        });
      }}
    >
      Remove Export
    </button>
  );
}

type SubTypedStartExportButtonProps = {
  route: SubTypedFactory.ExportSubTypedRouteLike;
  utils: SubTypedFactory.ExportSubTypesUtilsLike;
  onExportStarted: (id: number) => void;
};
function SubTypedStartExportButton(props: SubTypedStartExportButtonProps) {
  const exportStarter = props.route.start.useMutation({
    onSuccess(data) {
      props.onExportStarted(data.id);

      props.utils.invalidate();
    },
  });

  return (
    <button
      data-testid="startExportBtn"
      onClick={() => {
        exportStarter.mutateAsync({
          filter: 'polymorphism react',
          name: 'Search for Polymorphism React',
          description: 'This field is unique to the sub-typed router',
        });
      }}
    >
      Start Export
    </button>
  );
}

function RefreshExportsListButton(props: {
  mutate: () => void;
  isPending: boolean;
}) {
  return (
    <button
      data-testid="refreshBtn"
      onClick={props.mutate}
      disabled={props.isPending}
    >
      Refresh
    </button>
  );
}

function ExportStatus<
  TStatus extends Factory.ExportRouteLike['status'],
>(props: {
  status: TStatus;
  renderAdditionalFields?: (data: InferQueryLikeData<TStatus>) => ReactNode;
  currentExport: number | null;
}) {
  const exportStatus = props.status.useQuery(
    { id: props.currentExport ?? -1 },
    { enabled: props.currentExport !== null },
  );

  if (!exportStatus.data) {
    return null;
  }

  return (
    <p>
      Last Export: `{exportStatus.data?.name}` (
      {exportStatus.data.downloadUri ? 'Ready!' : 'Working'})
      {props.renderAdditionalFields?.(exportStatus.data as unknown as any)}
    </p>
  );
}

function ExportsList(props: { list: Factory.ExportRouteLike['list'] }) {
  const exportsList = props.list.useQuery();

  return (
    <>
      <h4>Downloads:</h4>
      <ul>
        {exportsList.data
          ?.map((item) =>
            item.downloadUri ? (
              <li key={item.id}>
                <a href={item.downloadUri ?? '#'}>{item.name}</a>
              </li>
            ) : null,
          )
          .filter(Boolean)}
      </ul>
    </>
  );
}
