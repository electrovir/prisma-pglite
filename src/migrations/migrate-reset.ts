import {type PartialWithUndefined, type RequiredAndNotNull} from '@augment-vir/common';
import {existsSync} from 'node:fs';
import {mkdir, readdir, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {
    getDefaultDbParentDirPath,
    getDefaultMigrationsDirPath,
    getDefaultSchemaPath,
} from '../util/default-paths.js';
import {generateInitSql} from '../util/sql-init.js';

/**
 * Parameters for {@link resetPgliteDatabase}.
 *
 * @category Internal
 */
export type ResetPgliteDatabaseParams = PartialWithUndefined<{
    /**
     * Path to the directory containing your Prisma migration folders. Each migration folder should
     * contain a `migration.sql` file.
     *
     * @default join(process.cwd(), 'prisma', 'migrations')
     */
    migrationsDirPath: string;
    /**
     * Path to the PGlite database directory.
     *
     * @default
     * - join('<dir of package-lock.json>', '.not-committed', 'pglite', 'dev')
     * - join(process.cwd(), '.not-committed', 'pglite', 'dev')
     */
    pgliteDatabaseDirPath: string;
    /**
     * Path to the Prisma schema file. Used as a fallback when no migrations exist.
     *
     * @default join(process.cwd(), 'prisma', 'schema.prisma')
     */
    schemaFilePath: string;
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
    const initSql = await generateInitSql(params.schemaFilePath);

    await rm(params.pgliteDatabaseDirPath, {
        force: true,
        recursive: true,
    });
    await mkdir(params.pgliteDatabaseDirPath, {
        recursive: true,
    });

    const pglite = new (await pgliteImport).PGlite(params.pgliteDatabaseDirPath);

    /* node:coverage disable */
    const migrationDirs = existsSync(params.migrationsDirPath)
        ? (
              await readdir(params.migrationsDirPath, {
                  withFileTypes: true,
              })
          )
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
              .sort()
        : [];

    if (migrationDirs.length) {
        for (const migrationDir of migrationDirs) {
            const migrationSqlPath = join(params.migrationsDirPath, migrationDir, 'migration.sql');
            if (existsSync(migrationSqlPath)) {
                const sql = await readFile(migrationSqlPath, 'utf-8');
                await pglite.exec(sql);
            }
        }
    } else {
        await pglite.exec(initSql);
    }
    /* node:coverage enable */

    /**
     * PGlite's WASM PostgreSQL startup sets process.exitCode as a side effect. Reset it after all
     * PGlite operations complete so it doesn't cause Node.js test runner failures.
     */
    process.exitCode = undefined;

    return pglite;
}

function finalizeResetParams(
    params: Readonly<ResetPgliteDatabaseParams>,
): RequiredAndNotNull<ResetPgliteDatabaseParams> {
    const schemaFilePath = params.schemaFilePath || getDefaultSchemaPath();

    return {
        pgliteDatabaseDirPath:
            params.pgliteDatabaseDirPath || join(getDefaultDbParentDirPath(), 'dev'),
        migrationsDirPath: params.migrationsDirPath || getDefaultMigrationsDirPath(schemaFilePath),
        schemaFilePath,
    };
}
