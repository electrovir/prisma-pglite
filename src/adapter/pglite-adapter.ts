import {check} from '@augment-vir/assert';
import {log, type PartialWithUndefined} from '@augment-vir/common';
import {extractTestNameAsDir, type UniversalTestContext} from '@augment-vir/test';
import {type PGlite} from '@electric-sql/pglite';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {resetPgliteDatabase} from '../migrations/migrate-reset.js';
import {getDefaultDbParentDirPath} from '../util/default-paths.js';
import {PrismaPGliteAdapterFactory} from './prisma-pglite-adapter/pglite.js';

/**
 * Params for {@link createPgliteAdapter}.
 *
 * @category Internal
 */
export type PgliteAdapterParams = PartialWithUndefined<{
    /**
     * Path to the directory containing your Prisma migration folders. Each migration folder should
     * contain a `migration.sql` file.
     *
     * @default join(process.cwd(), 'prisma', 'migrations')
     */
    migrationsDirPath: string;
    /**
     * Path to the Prisma schema file. Used as a fallback when no migrations exist.
     *
     * @default join(process.cwd(), 'prisma', 'schema.prisma')
     */
    schemaFilePath: string;
    /**
     * This is the path to your PGlite parent directory. Inside of this directory will be created
     * the actual PGlite directories for each database name..
     *
     * @default
     * - join('<dir of package-lock.json>', '.not-committed', 'pglite')
     * - join(process.cwd(), '.not-committed', 'pglite')
     */
    dbParentDirPath: string;
    /**
     * A optional name for the database. This allows separate prisma schemas to be used (for
     * different databases) with the same configurations otherwise. If this is provided, the final
     * database directory will be in `join(dbParentDirPath, <dbDirName || 'dev'>, databaseName)`
     */
    databaseName: string;
    /**
     * Overwrites `dbParentDirPath` and `testContext`, if either is provided, to provide a direct
     * path to the PGlite database folder rather than deducing the folder path from
     * `dbParentDirPath`.
     *
     * @default
     * undefined
     */
    directDatabaseDirPath: string;
    /**
     * Either a `UniversalTestContext` instance (which a dir name is extracted from), or a direct
     * database dir name. This is primarily used for running unit tests with a new database per
     * test, but can also be used to override the default `'dev'` database dir name. If this is
     * provided, the final database directory will be in `join(dbParentDirPath, <dbDirName>)`.
     *
     * @default undefined
     */
    dbDirName: string | UniversalTestContext;
    /**
     * If set to true, any existing database at the database path will be deleted before setting up
     * a new fresh instance.
     *
     * @default false
     */
    resetDatabase: boolean;
}>;

/**
 * Params for {@link PrismaPgliteAdapter}.
 *
 * @category Internal
 */
export type PrismaPgliteAdapterParams = {
    wasJustInitialized: boolean;
    databaseDirPath: string;
};

/**
 * Extension of the core `PrismaPGlite` PGlite adapter that adds extra properties for external
 * convenience.
 *
 * @category Internal
 */
export class PrismaPgliteAdapter extends PrismaPGliteAdapterFactory {
    public readonly wasJustInitialized: boolean;
    public readonly databaseDirPath: string;

    constructor(pglite: PGlite, params: Readonly<PrismaPgliteAdapterParams>) {
        super(pglite);

        this.wasJustInitialized = params.wasJustInitialized;
        this.databaseDirPath = params.databaseDirPath;
    }
}

/**
 * Creates a PGlite adapter than can be used with the `PrismaClient` constructor. This will create a
 * new PGlite database on your file system, if one does not already exist, and push your schema to
 * it (similar to `prisma db push`). This _cannot_, however, push new migrations to an existing
 * PGlite database (as `prisma db push` does with a normal Postgres database).
 *
 * Ensure that you have the `"driverAdapters"` preview feature enabled in your Prisma schema.
 *
 * @category Adapter
 * @example
 *
 * Usage in TypeScript:
 *
 * ```ts
 * import {PrismaClient} from '../generated/client.js';
 * import {createPgliteAdapter} from 'prisma-pglite';
 *
 * const prismaClient = new PrismaClient({
 *     adapter: await createPgliteAdapter({
 *         schemaFilePath,
 *         migrationsDirPath,
 *     }),
 * });
 * ```
 *
 * @example
 *
 * Requirement in `schema.prisma`:
 *
 * ```prisma
 * generator jsClient {
 *     provider        = "prisma-client-js"
 *     previewFeatures = ["strictUndefinedChecks", "driverAdapters"]
 * }
 * ```
 */
export async function createPgliteAdapter(
    params: PgliteAdapterParams = {},
): Promise<PrismaPgliteAdapter> {
    try {
        /* node:coverage ignore next 1: this is not a branch operation */
        const {PGlite} = await import('@electric-sql/pglite');

        const dbDirName: string = check.isString(params.dbDirName)
            ? params.dbDirName
            : params.dbDirName
              ? extractTestNameAsDir(params.dbDirName)
              : 'dev';

        const pathParts: string[] = [
            params.dbParentDirPath || getDefaultDbParentDirPath(),
            dbDirName,
            params.databaseName || '',
        ].filter(check.isTruthy);

        const databaseDirPath = params.directDatabaseDirPath || join(...pathParts);

        const needsReset = params.resetDatabase || !existsSync(databaseDirPath);

        const pglite = needsReset
            ? await resetPgliteDatabase({
                  migrationsDirPath: params.migrationsDirPath,
                  pgliteDatabaseDirPath: databaseDirPath,
                  schemaFilePath: params.schemaFilePath,
              })
            : new PGlite(databaseDirPath);

        await pglite.waitReady;
        /**
         * PGlite's WASM PostgreSQL startup sets process.exitCode as a side effect. Reset it after
         * initialization completes so it doesn't cause Node.js test runner failures.
         */
        process.exitCode = undefined;

        return new PrismaPgliteAdapter(pglite, {
            databaseDirPath,
            wasJustInitialized: needsReset,
        });
    } catch (error) {
        log.error(error);
        /** Add our own error message because PGlite's error messages are really cryptic. */
        throw new Error('Failed to initialize PGlite Prisma adapter', {
            cause: error,
        });
    }
}
