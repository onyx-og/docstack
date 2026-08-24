import { useCallback, useEffect, useState } from 'react';
import { useDocStack } from '../components/StackProvider/index.js';
import type { SyncStatus } from '@docstack/client';

/**
 * Subscribes to replication state for one stack, or for all of them.
 *
 * Reads the state DocStack's sync layer keeps rather than tracking replication in the
 * component: `lastConvergedAt` is the honest "last synced" value - the moment a cycle
 * finished with nothing left to send - while `lastActiveAt` only says documents moved.
 *
 * The subscription is on the stacks, not on the replication handles, so it survives a
 * {@link StackSyncHandle.restart} (a refreshed credential, say) and works whether it
 * mounts before or after `sync()` was called.
 *
 * @param stackName - Narrow to a single stack. Omit for every open stack.
 * @returns A map of stack name to {@link SyncStatus}; empty for stacks that have never
 * synced.
 *
 * @example
 * ```tsx
 * const SyncBadge = ({ stack }: { stack: string }) => {
 *     const status = useSyncStatus(stack)[stack];
 *     if (!status) return <span>Not syncing</span>;
 *     if (status.state === 'error') return <span>Offline - retrying</span>;
 *     return <span>Synced {status.lastConvergedAt ? timeAgo(status.lastConvergedAt) : 'never'}</span>;
 * };
 * ```
 */
export const useSyncStatus = (stackName?: string): Record<string, SyncStatus> => {
    const docStack = useDocStack();
    const [statuses, setStatuses] = useState<Record<string, SyncStatus>>({});

    const collect = useCallback((): Record<string, SyncStatus> => {
        if (!docStack) return {};
        const stacks = stackName
            ? [docStack.getStack(stackName)].filter(Boolean)
            : docStack.getStacks();

        const next: Record<string, SyncStatus> = {};
        for (const stack of stacks) {
            const status = stack!.getSyncStatus();
            if (status) next[stack!.name] = status;
        }
        return next;
    }, [docStack, stackName]);

    useEffect(() => {
        if (!docStack) return;

        let subscribed: { target: EventTarget; }[] = [];

        const onStatus = () => setStatuses(collect());

        const subscribe = () => {
            for (const { target } of subscribed) {
                target.removeEventListener('sync-status', onStatus);
            }
            const stacks = stackName
                ? [docStack.getStack(stackName)].filter(Boolean)
                : docStack.getStacks();
            subscribed = stacks.map(stack => ({ target: stack as unknown as EventTarget }));
            for (const { target } of subscribed) {
                target.addEventListener('sync-status', onStatus);
            }
            onStatus();
        };

        // The set of stacks is not fixed: one joined at runtime has to be picked up.
        docStack.addEventListener('stack-added', subscribe);
        docStack.addEventListener('stack-removed', subscribe);
        subscribe();

        return () => {
            docStack.removeEventListener('stack-added', subscribe);
            docStack.removeEventListener('stack-removed', subscribe);
            for (const { target } of subscribed) {
                target.removeEventListener('sync-status', onStatus);
            }
        };
    }, [docStack, stackName, collect]);

    return statuses;
};
