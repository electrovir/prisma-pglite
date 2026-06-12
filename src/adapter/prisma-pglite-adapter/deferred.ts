/**
 * This file is copied from
 * https://github.com/lucasthevenet/pglite-utils/blob/97a566f7df47841845ff8e3c3a61f5b40f5a9e98/packages/prisma-adapter/src/deferred.ts
 *
 * Which has the MIT license, author `Lucas Thevenet <lcervantes@dc.uba.ar>`.
 */

/* node:coverage disable */

export type Deferred<T> = {
    resolve(value: T | PromiseLike<T>): void;
    reject(reason: unknown): void;
};

export function createDeferred<T>(): [
    Deferred<T>,
    Promise<T>,
] {
    const deferred = {} as Deferred<T>;
    return [
        deferred,
        new Promise((resolve, reject) => {
            deferred.resolve = resolve;
            deferred.reject = reject;
        }),
    ];
}
