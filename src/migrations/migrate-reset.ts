import {type PartialWithUndefined} from '@augment-vir/common';
import {mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {
    getDefaultDbParentDirPath,
    getDefaultMigrationsDirPath,
    getDefaultPrismaConfigPath,
} from '../util/default-paths.js';
import {resolvePrismaConfigPaths} from '../util/prisma-config.js';
import {
    applyMigrationsOrPushSchema,
    readMigrationList,
    readSchemaContainers,
} from './schema-engine.js';

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
 * `prisma migrate reset` with a plain Postgres database. Existing migrations are applied through
 * the Prisma schema engine; if there are no migrations, the schema is pushed directly (like `prisma
 * db push`).
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

    const [
        schemaContainers,
        migrations,
    ] = await Promise.all([
        readSchemaContainers(schemaPath),
        readMigrationList(migrationsDirPath),
    ]);

    /* node:coverage ignore next 1: dynamic imports are not a branch */
    const {PGlite} = await import('@electric-sql/pglite');

    await rm(pgliteDatabaseDirPath, {
        force: true,
        recursive: true,
    });
    await mkdir(pgliteDatabaseDirPath, {
        recursive: true,
    });

    const pglite = new PGlite(pgliteDatabaseDirPath);
    await pglite.waitReady;

    await applyMigrationsOrPushSchema({
        pglite,
        migrations,
        schemaContainers,
    });

    /**
     * PGlite's WASM PostgreSQL startup sets process.exitCode as a side effect. Reset it after all
     * PGlite operations complete so it doesn't cause Node.js test runner failures.
     */
    process.exitCode = undefined;

    return pglite;
}
