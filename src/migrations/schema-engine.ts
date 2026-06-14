// cspell:words datamodels wbindgen

import {type PGlite} from '@electric-sql/pglite';
import {bindMigrationAwareSqlAdapterFactory} from '@prisma/driver-adapter-utils';
import {
    type MigrationList,
    type SchemaContainer,
    type SchemaEngine,
} from '@prisma/schema-engine-wasm/schema_engine_bg';
import {existsSync} from 'node:fs';
import {readdir, readFile, stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, extname, join} from 'node:path';
import {PrismaPGliteAdapterFactory} from '../adapter/prisma-pglite-adapter/pglite.js';

type SchemaEngineModule = typeof import('@prisma/schema-engine-wasm/schema_engine_bg');

const require = createRequire(import.meta.url);

/**
 * Empty schema filter (no externally-managed tables or enums). Required by the schema engine's
 * migration commands.
 *
 * @category Internal
 */
export const emptySchemaFilter = {
    externalTables: [],
    externalEnums: [],
};

let schemaEngineModulePromise: Promise<SchemaEngineModule> | undefined;

/**
 * Loads and initializes the Prisma WASM schema engine from `@prisma/schema-engine-wasm`.
 *
 * We instantiate the WASM module ourselves (read its bytes + `WebAssembly.instantiate`) rather than
 * importing the package's top-level entry (which `import`s the `.wasm` as an ES module and requires
 * experimental Node flags) and rather than going through `@prisma/internals` (whose WASM loader
 * reads from a `build/` directory that isn't shipped in the published package). The result is
 * cached so the WASM module is only compiled once.
 */
async function loadSchemaEngineModule(): Promise<SchemaEngineModule> {
    if (!schemaEngineModulePromise) {
        schemaEngineModulePromise = (async () => {
            /* node:coverage ignore next 1: dynamic imports do not have branches */
            const runtime = await import('@prisma/schema-engine-wasm/schema_engine_bg');
            const wasmFilePath = join(
                dirname(require.resolve('@prisma/schema-engine-wasm/schema_engine_bg')),
                'schema_engine_bg.wasm',
            );
            const wasmModule = new WebAssembly.Module(await readFile(wasmFilePath));
            const wasmInstance = new WebAssembly.Instance(wasmModule, {
                './schema_engine_bg.js': runtime as unknown as WebAssembly.ModuleImports,
            });
            (runtime as unknown as {__wbg_set_wasm: (wasm: unknown) => void}).__wbg_set_wasm(
                wasmInstance.exports,
            );
            (wasmInstance.exports as unknown as {__wbindgen_start: () => void}).__wbindgen_start();
            return runtime;
        })();
    }

    return schemaEngineModulePromise;
}

/**
 * Run a callback with a WASM schema engine connected to the given PGlite instance through this
 * package's migration-aware driver adapter. The engine is freed afterwards; the PGlite instance is
 * left open.
 *
 * @category Internal
 */
export async function withSchemaEngine<T>(
    pglite: PGlite,
    callback: (engine: SchemaEngine) => Promise<T>,
): Promise<T> {
    const runtime = await loadSchemaEngineModule();
    const adapter = bindMigrationAwareSqlAdapterFactory(new PrismaPGliteAdapterFactory(pglite));
    const engine = await runtime.SchemaEngine.new(
        {
            datamodels: undefined,
        },
        () => {},
        adapter,
    );

    try {
        return await callback(engine);
    } finally {
        engine.free();
    }
}

/**
 * Reads a Prisma schema (a single `.prisma` file or a schema folder) into the `SchemaContainer`
 * list the schema engine expects.
 *
 * @category Internal
 */
export async function readSchemaContainers(schemaPath: string): Promise<SchemaContainer[]> {
    const isDirectory = (await stat(schemaPath)).isDirectory();
    const schemaFilePaths = isDirectory
        ? (await readdir(schemaPath))
              .filter((entry) => extname(entry) === '.prisma')
              .sort()
              .map((entry) => join(schemaPath, entry))
        : [schemaPath];

    return Promise.all(
        schemaFilePaths.map(async (filePath) => {
            return {
                path: filePath,
                content: await readFile(filePath, 'utf-8'),
            };
        }),
    );
}

/**
 * Migration lock file name required by Prisma to deploy migrations.
 *
 * @category Internal
 */
export const migrationLockFileName = 'migration_lock.toml';

/**
 * Reads the migrations directory into the `MigrationList` the schema engine expects. Returns an
 * empty list (no migration directories) if the directory does not exist.
 *
 * @category Internal
 */
export async function readMigrationList(migrationsDirPath: string): Promise<MigrationList> {
    const lockfilePath = join(migrationsDirPath, migrationLockFileName);

    const migrationDirectories = existsSync(migrationsDirPath)
        ? await Promise.all(
              (
                  await readdir(migrationsDirPath, {
                      withFileTypes: true,
                  })
              )
                  .filter((entry) => entry.isDirectory())
                  .map((entry) => entry.name)
                  .sort()
                  .map(async (name) => {
                      return {
                          path: name,
                          migrationFile: {
                              path: 'migration.sql' as const,
                              content: {
                                  tag: 'ok' as const,
                                  value: await readFile(
                                      join(migrationsDirPath, name, 'migration.sql'),
                                      'utf-8',
                                  ),
                              },
                          },
                      };
                  }),
          )
        : [];

    return {
        baseDir: migrationsDirPath,
        lockfile: {
            path: migrationLockFileName,
            content: existsSync(lockfilePath) ? await readFile(lockfilePath, 'utf-8') : null,
        },
        shadowDbInitScript: '',
        migrationDirectories,
    };
}

/**
 * Generates the SQL for the next migration by diffing the database backing `shadowPglite` (after
 * the existing migration history has been replayed into it) against the target schema. This avoids
 * Prisma's shadow-database requirement (unimplemented for PostgreSQL in the WASM engine) by using a
 * throwaway PGlite instance as the diff baseline.
 *
 * @category Internal
 * @returns The migration SQL, or `undefined` if there are no changes.
 */
export async function diffMigrationSql({
    shadowPglite,
    existingMigrations,
    schemaContainers,
    schemaConfigDir,
}: Readonly<{
    shadowPglite: PGlite;
    existingMigrations: MigrationList;
    schemaContainers: SchemaContainer[];
    schemaConfigDir: string;
}>): Promise<string | undefined> {
    return withSchemaEngine(shadowPglite, async (engine) => {
        if (existingMigrations.migrationDirectories.length) {
            await engine.applyMigrations({
                migrationsList: existingMigrations,
                filters: emptySchemaFilter,
            });
        }

        const diff = await engine.diff({
            from: {
                tag: 'schemaDatasource',
                files: schemaContainers,
                configDir: schemaConfigDir,
            },
            to: {
                tag: 'schemaDatamodel',
                files: schemaContainers,
            },
            script: true,
            exitCode: true,
            filters: emptySchemaFilter,
        });

        /** With `exitCode: true`, the engine returns 0 for an empty diff and 2 for a non-empty one. */
        if (diff.exitCode === 0 || !diff.stdout) {
            return undefined;
        }

        return diff.stdout;
    });
}

/**
 * Brings the database backing `pglite` up to the given schema: applies the migration history when
 * migrations exist, otherwise pushes the schema directly (equivalent to `prisma db push`).
 *
 * @category Internal
 */
export async function applyMigrationsOrPushSchema({
    pglite,
    migrations,
    schemaContainers,
}: Readonly<{
    pglite: PGlite;
    migrations: MigrationList;
    schemaContainers: SchemaContainer[];
}>): Promise<void> {
    await withSchemaEngine(pglite, async (engine) => {
        if (migrations.migrationDirectories.length) {
            await engine.applyMigrations({
                migrationsList: migrations,
                filters: emptySchemaFilter,
            });
        } else {
            await engine.schemaPush({
                force: true,
                schema: {
                    files: schemaContainers,
                },
                filters: emptySchemaFilter,
            });
        }
    });
}
