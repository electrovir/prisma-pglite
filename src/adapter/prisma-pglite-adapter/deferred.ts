/**
 * This file is copied from
 * https://github.com/lucasthevenet/pglite-utils/blob/7e9fa3c9d6ef39e05c2a6e14f1037a87b8a26f4a/packages/prisma-adapter/src/conversion.ts
 *
 * Which has the MIT license, author `Lucas Thevenet <lcervantes@dc.uba.ar>`.
 */

/* node:coverage disable */

export type Deferred<T> = {
    resolve(value: T | PromiseLike<T>): void;
    reject(reason: unknown): void;
};

export function createDeferred<T>(): [Deferred<T>, Promise<T>] {
    const deferred = {} as Deferred<T>;
    return [
        deferred,
        new Promise((resolve, reject) => {
            deferred.resolve = resolve;
            deferred.reject = reject;
        }),
    ];
}
