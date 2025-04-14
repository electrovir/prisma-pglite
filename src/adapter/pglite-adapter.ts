import {log, type PartialWithUndefined} from '@augment-vir/common';
import {extractTestName, type UniversalTestContext} from '@augment-vir/test';
import {existsSync} from 'node:fs';
import {mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {PrismaPGlite} from 'pglite-prisma-adapter';
import {getDefaultPgliteDirPath, getDefaultSchemaPath} from '../util/default-paths.js';
import {generateInitSql} from '../util/sql-init.js';

/**
 * Params for {@link createPgliteAdapter}.
 *
 * @category Internal
 */
export type PgliteAdapterParams = PartialWithUndefined<{
    /**
     * This is the path to your PGlite parent directory. Inside of this directly will be created the
     * actual PGlite directories for either `'dev'` or the provided test context.
     *
     * @default
     * - join('<dir of package-lock.json>', '.not-committed', 'pglite')
     * - join(process.cwd(), '.not-committed', 'pglite')
     */
    pgliteDirPath: string;
    /**
     * Overwrites `pgliteDirPath` and `testContext`, if either is provided, to provide a direct path
     * to the PGlite database folder rather than deducing the folder path from `pgliteDirPath`.
     *
     * @default
     * undefined
     */
    directDatabaseDirPath: string;
    /**
     * A test context for running Prisma PGlite for unit tests. If a test context is provided, the
     * final database directory will be `join(pgliteDirPath, <test-name>)`.
     *
     * @default undefined
     */
    testContext: UniversalTestContext;
    /**
     * Path to the `schema.prisma` file. This is necessary in order to generate the SQL init script
     * necessary for PGlite to initialize your database.
     *
     * @default join(process.cwd(), 'prisma', 'schema.prisma')
     */
    schemaFilePath: string;
    /**
     * Silence all logging.
     *
     * @default false
     */
    silent: boolean;
    /**
     * If set to true, any existing database at the database path will be deleted before setting up
     * a new fresh instance.
     *
     * @default false
     */
    resetDatabase: boolean;
}>;

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
 * import {PrismaClient} from '@prisma/client';
 * import {createPgliteAdapter} from 'prisma-pglite';
 *
 * const prismaClient = new PrismaClient({
 *     adapter: await createPgliteAdapter({
 *         schemaFilePath,
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
export async function createPgliteAdapter(params: PgliteAdapterParams = {}) {
    try {
        /* node:coverage ignore next 1: this is not a branch operation */
        const {PGlite} = await import('@electric-sql/pglite');

        const testName = params.testContext ? extractTestName(params.testContext) : undefined;

        const databaseDirPath =
            params.directDatabaseDirPath ||
            join(params.pgliteDirPath || getDefaultPgliteDirPath(), testName || 'dev');

        if (
            params.resetDatabase ||
            /** For tests, always reset the database. */
            testName
        ) {
            await rm(databaseDirPath, {recursive: true, force: true});
        }
        const needsInit = !existsSync(databaseDirPath);
        await mkdir(databaseDirPath, {recursive: true});

        const pglite = new PGlite(databaseDirPath);

        if (needsInit) {
            await pglite.exec(
                await generateInitSql(
                    params.schemaFilePath || getDefaultSchemaPath(),
                    params.silent,
                ),
            );
        }
        return new PrismaPGlite(pglite);
    } catch (error) {
        log.if(!params.silent).error(error);
        /** Add our own error message because PGlite's error messages are really cryptic. */
        throw new Error('Failed to initialize PGlite Prisma adapter', {cause: error});
    }
}
