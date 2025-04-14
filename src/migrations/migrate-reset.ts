import {log, type PartialWithUndefined, type RequiredAndNotNull} from '@augment-vir/common';
import {mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {getDefaultPgliteDirPath, getDefaultSchemaPath} from '../util/default-paths.js';
import {generateInitSql} from '../util/sql-init.js';

/**
 * Parameters for {@link resetPgliteDatabase}.
 *
 * @category Internal
 */
export type ResetPgliteDatabaseParams = PartialWithUndefined<{
    /**
     * Path to your Prisma schema file. If this is not provided, it will be deduced from your cwd.
     *
     * @default
     * join(process.cwd(), 'prisma', 'schema.prisma')
     */
    schemaFilePath: string;
    /**
     * Path to the PGlite database directory.
     *
     * @default
     * - join('<dir of package-lock.json>', '.not-committed', 'pglite', 'dev')
     * - join(process.cwd(), '.not-committed', 'pglite', 'dev')
     */
    pgliteDatabaseDirPath: string;
    /**
     * Silence all logging.
     *
     * @default false
     */
    silent: boolean;
}>;

/**
 * Reset a dev database to your Prisma schema with a PGlite database. This is analogous to running
 * `prisma migrate reset` with a plain Postgres database.
 *
 * @category CLI
 */
export async function resetPgliteDatabase(rawParams: Readonly<ResetPgliteDatabaseParams> = {}) {
    const params = finalizeResetParams(rawParams);

    /* node:coverage ignore next 1: dynamic imports are not a branch */
    const pgliteImport = import('@electric-sql/pglite');
    const initSql = generateInitSql(params.schemaFilePath, params.silent);

    await rm(params.pgliteDatabaseDirPath, {force: true, recursive: true});
    await mkdir(params.pgliteDatabaseDirPath, {recursive: true});

    const pglite = new (await pgliteImport).PGlite(params.pgliteDatabaseDirPath);
    await pglite.exec(await initSql);

    log.if(!params.silent).success(`PGlite database reset at:\n'${params.pgliteDatabaseDirPath}'`);

    return await initSql;
}

function finalizeResetParams(
    params: Readonly<ResetPgliteDatabaseParams>,
): RequiredAndNotNull<ResetPgliteDatabaseParams> {
    return {
        schemaFilePath: params.schemaFilePath || getDefaultSchemaPath(),
        pgliteDatabaseDirPath:
            params.pgliteDatabaseDirPath || join(getDefaultPgliteDirPath(), 'dev'),
        silent: !!params.silent,
    };
}
