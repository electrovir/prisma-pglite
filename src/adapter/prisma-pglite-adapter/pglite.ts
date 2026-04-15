/**
 * This file is copied from
 * https://github.com/lucasthevenet/pglite-utils/blob/7e9fa3c9d6ef39e05c2a6e14f1037a87b8a26f4a/packages/prisma-adapter/src/conversion.ts
 *
 * Which has the MIT license, author `Lucas Thevenet <lcervantes@dc.uba.ar>`. It has been modified
 * slightly to pass this package's ESLint and TypeScript settings.
 */

/* node:coverage disable */

import * as pglite from '@electric-sql/pglite';
import type {PGliteWorker} from '@electric-sql/pglite/dist/worker/index.js';
import type {
    ColumnType,
    ConnectionInfo,
    IsolationLevel,
    SqlDriverAdapter,
    SqlMigrationAwareDriverAdapterFactory,
    SqlQuery,
    SqlQueryable,
    SqlResultSet,
    Transaction,
    TransactionOptions,
} from '@prisma/driver-adapter-utils';
import {Debug, DriverAdapterError} from '@prisma/driver-adapter-utils';
import {
    UnsupportedNativeDataType,
    customParsers,
    fieldToColumnType,
    fixArrayBufferValues,
} from './conversion.js';
import {createDeferred, type Deferred} from './deferred.js';

const adapterName = 'prisma-pglite-adapter';

const debug = Debug('prisma:driver-adapter:pglite');

class PGliteQueryable<ClientT extends pglite.PGlite | PGliteWorker | pglite.Transaction>
    implements SqlQueryable
{
    public readonly provider = 'postgres';
    public readonly adapterName = adapterName;

    constructor(public readonly pgliteClient: ClientT) {}

    public async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
        const tag = '[js::query_raw]';
        debug(`${tag} %O`, query);

        const {fields, rows} = await this.performIO(query);

        const columnNames = fields.map((field) => field.name);
        let columnTypes: ColumnType[] = [];

        try {
            columnTypes = fields.map((field) => fieldToColumnType(field.dataTypeID));
        } catch (e) {
            if (e instanceof UnsupportedNativeDataType) {
                throw new DriverAdapterError({
                    kind: 'UnsupportedNativeDataType',
                    type: e.type,
                });
            }
            throw e;
        }

        return {
            columnNames,
            columnTypes,
            rows: rows as SqlResultSet['rows'],
        };
    }

    /**
     * Execute a query given as SQL, interpolating the given parameters and returning the number of
     * affected rows.
     */
    public async executeRaw(query: SqlQuery): Promise<number> {
        const tag = '[js::execute_raw]';
        debug(`${tag} %O`, query);

        // Note: `affectedRows` can sometimes be null (e.g., when executing `"BEGIN"`)
        return (await this.performIO(query)).affectedRows ?? 0;
    }

    private async performIO(query: SqlQuery): Promise<pglite.Results<unknown>> {
        const {sql, args: values} = query;

        try {
            const result = await this.pgliteClient.query(sql, fixArrayBufferValues(values), {
                rowMode: 'array',
                parsers: customParsers,
            });

            return result;
        } catch (e) {
            this.onError(e);
        }
    }

    protected onError(error: unknown): never {
        debug('Error in performIO: %O', error);
        if (error instanceof pglite.messages.DatabaseError) {
            throw new DriverAdapterError({
                kind: 'postgres',
                code: error.code ?? 'UNKNOWN',
                severity: error.severity ?? 'UNKNOWN',
                message: error.message,
                detail: error.detail,
                column: error.column,
                hint: error.hint,
            });
        }
        throw error;
    }
}

class PGliteTransaction extends PGliteQueryable<pglite.Transaction> implements Transaction {
    constructor(
        client: pglite.Transaction,
        public readonly options: TransactionOptions,
        private txDeferred: Deferred<void>,
        private txResultPromise: Promise<void>,
    ) {
        super(client);
    }

    public async commit(): Promise<void> {
        debug('[js::commit]');
        this.txDeferred.resolve();
        return await this.txResultPromise;
    }

    public async rollback(): Promise<void> {
        debug('[js::rollback]');
        await this.pgliteClient.rollback();
        this.txDeferred.resolve();
        return await this.txResultPromise;
    }
}

export type PrismaPGliteOptions = {
    schema?: string;
};

class PrismaPGliteAdapter extends PGliteQueryable<pglite.PGlite> implements SqlDriverAdapter {
    constructor(
        client: pglite.PGlite,
        private options?: PrismaPGliteOptions,
    ) {
        super(client);
    }

    public async executeScript(script: string): Promise<void> {
        try {
            await this.pgliteClient.exec(script);
        } catch (e) {
            this.onError(e);
        }
    }

    public getConnectionInfo(): ConnectionInfo {
        return {
            ...(this.options?.schema
                ? {
                      schemaName: this.options.schema,
                  }
                : {}),
            supportsRelationJoins: true,
        };
    }

    public async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
        const options: TransactionOptions = {
            usePhantomQuery: true,
        };

        const tag = '[js::startTransaction]';
        debug('%s options: %O', tag, options);
        if (isolationLevel) {
            await this.pgliteClient
                .exec(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`)
                .catch((error: unknown) => this.onError(error));
        }
        return this.startTransactionInner(this.pgliteClient, options);
    }

    public async startTransactionInner(
        conn: pglite.PGlite,
        options: TransactionOptions,
    ): Promise<Transaction> {
        return new Promise<Transaction>((resolve, reject) => {
            const txResultPromise = conn
                .transaction(async (tx) => {
                    const [
                        txDeferred,
                        deferredPromise,
                    ] = createDeferred<void>();
                    const txWrapper = new PGliteTransaction(
                        tx,
                        options,
                        txDeferred,
                        txResultPromise,
                    );
                    resolve(txWrapper);
                    return deferredPromise;
                })
                .catch((error: unknown) => {
                    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                    return reject(error);
                });
        });
    }

    public async dispose(): Promise<void> {
        return Promise.resolve();
    }
}

export class PrismaPGliteAdapterFactory implements SqlMigrationAwareDriverAdapterFactory {
    /** Required for Prisma. */
    public readonly provider = 'postgres';
    /** Required for Prisma. */
    public readonly adapterName = adapterName;

    constructor(public readonly pgliteClient: pglite.PGlite) {}

    /** Instantiate a driver adapter. Required for Prisma. */
    public connect(): Promise<SqlDriverAdapter> {
        return Promise.resolve(new PrismaPGliteAdapter(this.pgliteClient));
    }

    /** Required for Prisma. */
    public connectToShadowDb(): Promise<SqlDriverAdapter> {
        return Promise.resolve(
            new PrismaPGliteAdapter(new pglite.PGlite({dataDir: 'memory://shadow'})),
        );
    }
}
