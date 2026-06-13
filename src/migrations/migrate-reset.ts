import {type PartialWithUndefined} from '@augment-vir/common';
import {existsSync} from 'node:fs';
import {mkdir, readdir, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {
    getDefaultDbParentDirPath,
    getDefaultMigrationsDirPath,
    getDefaultPrismaConfigPath,
} from '../util/default-paths.js';
import {resolvePrismaConfigPaths} from '../util/prisma-config.js';
import {generateInitSql} from '../util/sql-init.js';

/**
 * Parameters for {@link resetPgliteDatabase}.
 *
 * @category Internal
 */
export type ResetPgliteDatabaseParams = PartialWithUndefined<{
    /**
     * Path to the PGlite database directory.
     *
     * @default
     * - join('<dir of package-lock.json>', '.not-committed', 'pglite', 'dev')
     * - join(process.cwd(), '.not-committed', 'pglite', 'dev')
     */
    pgliteDatabaseDirPath: string;
    /**
     * Path to a Prisma config file (`prisma.config.ts`). Prisma v7 reads the schema location,
     * datasource, and (if set) the `migrations.path` from this config. The migrations directory is
     * derived from it: the config's `migrations.path` if set, otherwise the `migrations` folder
     * next to the schema.
     *
     * @default join(process.cwd(), 'prisma.config.ts')
     */
    prismaConfigPath: string;
}>;

/**
 * Reset a dev database to your Prisma schema with a PGlite database. This is analogous to running
 * `prisma migrate reset` with a plain Postgres database.
 *
 * @category CLI
 */
export async function resetPgliteDatabase(rawParams: Readonly<ResetPgliteDatabaseParams> = {}) {
    const prismaConfigPath = rawParams.prismaConfigPath || getDefaultPrismaConfigPath();
    const pgliteDatabaseDirPath =
        rawParams.pgliteDatabaseDirPath || join(getDefaultDbParentDirPath(), 'dev');
    const {schemaPath, migrationsDirPath: configMigrationsDirPath} =
        await resolvePrismaConfigPaths(prismaConfigPath);
    const migrationsDirPath = configMigrationsDirPath || getDefaultMigrationsDirPath(schemaPath);

    /* node:coverage ignore next 1: dynamic imports are not a branch */
    const pgliteImport = import('@electric-sql/pglite');

    await rm(pgliteDatabaseDirPath, {
        force: true,
        recursive: true,
    });
    await mkdir(pgliteDatabaseDirPath, {
        recursive: true,
    });

    const pglite = new (await pgliteImport).PGlite(pgliteDatabaseDirPath);

    /* node:coverage disable */
    const migrationDirs = existsSync(migrationsDirPath)
        ? (
              await readdir(migrationsDirPath, {
                  withFileTypes: true,
              })
          )
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
              .sort()
        : [];

    if (migrationDirs.length) {
        for (const migrationDir of migrationDirs) {
            const migrationSqlPath = join(migrationsDirPath, migrationDir, 'migration.sql');
            if (existsSync(migrationSqlPath)) {
                const sql = await readFile(migrationSqlPath, 'utf-8');
                await pglite.exec(sql);
            }
        }
    } else {
        await pglite.exec(await generateInitSql(prismaConfigPath));
    }
    /* node:coverage enable */

    /**
     * PGlite's WASM PostgreSQL startup sets process.exitCode as a side effect. Reset it after all
     * PGlite operations complete so it doesn't cause Node.js test runner failures.
     */
    process.exitCode = undefined;

    return pglite;
}
