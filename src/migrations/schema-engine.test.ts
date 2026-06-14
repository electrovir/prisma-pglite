// cspell:words schemaname tablename pkey

import {assert} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
    applyMigrationsOrPushSchema,
    diffMigrationSql,
    emptySchemaFilter,
    readMigrationList,
    readSchemaContainers,
    withSchemaEngine,
} from './schema-engine.js';

const datasourceBlock = 'datasource db {\n    provider = "postgresql"\n}\n\n';

function schema(models: string): string {
    return datasourceBlock + models;
}

function schemaFiles(models: string) {
    return [
        {
            path: join(tmpdir(), 'schema.prisma'),
            content: schema(models),
        },
    ];
}

async function withTempPglite<T>(callback: (pglite: PGlite) => Promise<T>): Promise<T> {
    const dirPath = join(tmpdir(), `prisma-pglite-test-${randomUUID()}`);
    const pglite = new PGlite(dirPath);
    await pglite.waitReady;
    process.exitCode = undefined;

    try {
        return await callback(pglite);
    } finally {
        await pglite.close();
        await rm(dirPath, {
            recursive: true,
            force: true,
        });
        process.exitCode = undefined;
    }
}

/**
 * Generates the migration SQL that would move a database matching `fromModels` (or empty, when
 * `fromModels` is `undefined`) to `toModels`. Mirrors how `createPgliteMigration` diffs a
 * history-built database against the target schema.
 */
async function diffSchemas(
    fromModels: string | undefined,
    toModels: string,
): Promise<string | undefined> {
    return withTempPglite(async (pglite) => {
        return withSchemaEngine(pglite, async (engine) => {
            if (fromModels !== undefined) {
                await engine.schemaPush({
                    force: true,
                    schema: {
                        files: schemaFiles(fromModels),
                    },
                    filters: emptySchemaFilter,
                });
            }

            const diff = await engine.diff({
                from: {
                    tag: 'schemaDatasource',
                    files: schemaFiles(toModels),
                    configDir: tmpdir(),
                },
                to: {
                    tag: 'schemaDatamodel',
                    files: schemaFiles(toModels),
                },
                script: true,
                exitCode: true,
                filters: emptySchemaFilter,
            });

            return diff.exitCode === 0 ? undefined : (diff.stdout ?? undefined);
        });
    });
}

const userModel = 'model User {\n    id String @id\n    name String\n}\n';

describe('migration SQL generation', () => {
    it('creates a table from an empty database', async () => {
        const sql = await diffSchemas(undefined, userModel);
        assert.isDefined(sql);
        assert.isIn('CREATE TABLE "User"', sql);
        assert.isIn('"id" TEXT NOT NULL', sql);
        assert.isIn('CONSTRAINT "User_pkey" PRIMARY KEY ("id")', sql);
    });

    it('reports no changes when the schema matches the database', async () => {
        assert.isUndefined(await diffSchemas(userModel, userModel));
    });

    it('adds a required column', async () => {
        const sql = await diffSchemas(
            userModel,
            'model User {\n    id String @id\n    name String\n    email String\n}\n',
        );
        assert.isDefined(sql);
        assert.isIn('ALTER TABLE "User"', sql);
        assert.isIn('ADD COLUMN', sql);
        assert.isIn('"email"', sql);
        assert.isIn('NOT NULL', sql);
        assert.isFalse(sql.includes('CREATE TABLE'));
    });

    it('adds a nullable column without NOT NULL', async () => {
        const sql = await diffSchemas(
            userModel,
            'model User {\n    id String @id\n    name String\n    nickname String?\n}\n',
        );
        assert.isDefined(sql);
        assert.isIn('ADD COLUMN', sql);
        assert.isIn('"nickname"', sql);
        assert.isFalse(sql.includes('"nickname" TEXT NOT NULL'));
    });

    it('drops a column', async () => {
        const sql = await diffSchemas(
            'model User {\n    id String @id\n    name String\n    email String\n}\n',
            userModel,
        );
        assert.isDefined(sql);
        assert.isIn('DROP COLUMN', sql);
        assert.isIn('"email"', sql);
    });

    it('treats a rename as a drop and add', async () => {
        const sql = await diffSchemas(
            userModel,
            'model User {\n    id String @id\n    fullName String\n}\n',
        );
        assert.isDefined(sql);
        assert.isIn('DROP COLUMN', sql);
        assert.isIn('ADD COLUMN', sql);
        assert.isIn('"fullName"', sql);
    });

    it('creates an additional table', async () => {
        const sql = await diffSchemas(
            userModel,
            `${userModel}\nmodel Post {\n    id String @id\n    title String\n}\n`,
        );
        assert.isDefined(sql);
        assert.isIn('CREATE TABLE "Post"', sql);
        assert.isFalse(sql.includes('CREATE TABLE "User"'));
    });

    it('drops a table', async () => {
        const sql = await diffSchemas(
            `${userModel}\nmodel Post {\n    id String @id\n    title String\n}\n`,
            userModel,
        );
        assert.isDefined(sql);
        assert.isIn('DROP TABLE "Post"', sql);
    });

    it('adds a unique index for @unique', async () => {
        const sql = await diffSchemas(
            userModel,
            'model User {\n    id String @id\n    name String\n    email String @unique\n}\n',
        );
        assert.isDefined(sql);
        assert.isIn('CREATE UNIQUE INDEX', sql);
        assert.isIn('"User_email_key"', sql);
    });

    it('adds a non-unique index for @@index', async () => {
        const sql = await diffSchemas(
            userModel,
            'model User {\n    id String @id\n    name String\n\n    @@index([name])\n}\n',
        );
        assert.isDefined(sql);
        assert.isIn('CREATE INDEX', sql);
        assert.isFalse(sql.includes('CREATE UNIQUE INDEX'));
    });

    it('adds a foreign key relation', async () => {
        const sql = await diffSchemas(
            'model User {\n    id String @id\n}\n',
            'model User {\n    id String @id\n    posts Post[]\n}\nmodel Post {\n    id String @id\n    userId String\n    user User @relation(fields: [userId], references: [id])\n}\n',
        );
        assert.isDefined(sql);
        assert.isIn('CREATE TABLE "Post"', sql);
        assert.isIn('FOREIGN KEY ("userId")', sql);
        assert.isIn('REFERENCES "User"', sql);
    });

    it('creates an enum type and a column using it', async () => {
        const sql = await diffSchemas(
            userModel,
            'enum Color {\n    red\n    green\n    blue\n}\nmodel User {\n    id String @id\n    name String\n    color Color\n}\n',
        );
        assert.isDefined(sql);
        assert.isIn('CREATE TYPE "Color" AS ENUM', sql);
        assert.isIn("'red', 'green', 'blue'", sql);
        assert.isIn('ADD COLUMN', sql);
    });

    it('changes an incompatible column type by dropping and re-adding', async () => {
        const sql = await diffSchemas(
            'model User {\n    id String @id\n    count String\n}\n',
            'model User {\n    id String @id\n    count Int\n}\n',
        );
        assert.isDefined(sql);
        assert.isIn('DROP COLUMN "count"', sql);
        assert.isIn('ADD COLUMN', sql);
        assert.isIn('INTEGER', sql);
    });

    it('adds a default value', async () => {
        const sql = await diffSchemas(
            'model User {\n    id String @id\n    active Boolean\n}\n',
            'model User {\n    id String @id\n    active Boolean @default(true)\n}\n',
        );
        assert.isDefined(sql);
        assert.isIn('ALTER COLUMN "active" SET DEFAULT', sql);
    });
});

describe(diffMigrationSql.name, () => {
    it('generates a create migration when there is no history', async () => {
        const sql = await withTempPglite(async (shadowPglite) => {
            return diffMigrationSql({
                shadowPglite,
                existingMigrations: await readMigrationList(join(tmpdir(), `none-${randomUUID()}`)),
                schemaContainers: schemaFiles(userModel),
                schemaConfigDir: tmpdir(),
            });
        });
        assert.isDefined(sql);
        assert.isIn('CREATE TABLE "User"', sql);
    });

    it('generates an incremental migration on top of replayed history', async () => {
        await withTempPglite(async (initialPglite) => {
            await applyMigrationsOrPushSchema({
                pglite: initialPglite,
                migrations: await readMigrationList(join(tmpdir(), `none-${randomUUID()}`)),
                schemaContainers: schemaFiles(userModel),
            });
        });

        const initSql = await diffSchemas(undefined, userModel);
        assert.isDefined(initSql);

        const existingMigrations = {
            baseDir: join(tmpdir(), `migrations-${randomUUID()}`),
            lockfile: {
                path: 'migration_lock.toml' as const,
                content: 'provider = "postgresql"',
            },
            shadowDbInitScript: '',
            migrationDirectories: [
                {
                    path: './0_init',
                    migrationFile: {
                        path: 'migration.sql' as const,
                        content: {
                            tag: 'ok' as const,
                            value: initSql,
                        },
                    },
                },
            ],
        };

        const incrementalSql = await withTempPglite(async (shadowPglite) => {
            return diffMigrationSql({
                shadowPglite,
                existingMigrations,
                schemaContainers: schemaFiles(
                    'model User {\n    id String @id\n    name String\n    email String?\n}\n',
                ),
                schemaConfigDir: tmpdir(),
            });
        });

        assert.isDefined(incrementalSql);
        assert.isIn('ADD COLUMN', incrementalSql);
        assert.isIn('"email"', incrementalSql);
        assert.isFalse(incrementalSql.includes('CREATE TABLE'));
    });

    it('returns undefined when the history already matches the schema', async () => {
        const initSql = await diffSchemas(undefined, userModel);
        assert.isDefined(initSql);

        const sql = await withTempPglite(async (shadowPglite) => {
            return diffMigrationSql({
                shadowPglite,
                existingMigrations: {
                    baseDir: join(tmpdir(), `migrations-${randomUUID()}`),
                    lockfile: {
                        path: 'migration_lock.toml',
                        content: 'provider = "postgresql"',
                    },
                    shadowDbInitScript: '',
                    migrationDirectories: [
                        {
                            path: '0_init',
                            migrationFile: {
                                path: 'migration.sql',
                                content: {
                                    tag: 'ok',
                                    value: initSql,
                                },
                            },
                        },
                    ],
                },
                schemaContainers: schemaFiles(userModel),
                schemaConfigDir: tmpdir(),
            });
        });

        assert.isUndefined(sql);
    });
});

describe(applyMigrationsOrPushSchema.name, () => {
    it('pushes the schema when there are no migrations', async () => {
        await withTempPglite(async (pglite) => {
            await applyMigrationsOrPushSchema({
                pglite,
                migrations: await readMigrationList(join(tmpdir(), `none-${randomUUID()}`)),
                schemaContainers: schemaFiles(userModel),
            });

            const tables = await pglite.query<{tablename: string}>(
                "select tablename from pg_tables where schemaname = 'public' order by tablename",
            );
            assert.deepEquals(
                tables.rows.map((row) => row.tablename),
                ['User'],
            );
        });
    });

    it('applies migrations and records them in _prisma_migrations', async () => {
        const initSql = await diffSchemas(undefined, userModel);
        assert.isDefined(initSql);

        await withTempPglite(async (pglite) => {
            await applyMigrationsOrPushSchema({
                pglite,
                migrations: {
                    baseDir: join(tmpdir(), `migrations-${randomUUID()}`),
                    lockfile: {
                        path: 'migration_lock.toml',
                        content: 'provider = "postgresql"',
                    },
                    shadowDbInitScript: '',
                    migrationDirectories: [
                        {
                            path: '0_init',
                            migrationFile: {
                                path: 'migration.sql',
                                content: {
                                    tag: 'ok',
                                    value: initSql,
                                },
                            },
                        },
                    ],
                },
                schemaContainers: schemaFiles(userModel),
            });

            const tracked = await pglite.query<{migration_name: string}>(
                'select migration_name from "_prisma_migrations"',
            );
            assert.deepEquals(
                tracked.rows.map((row) => row.migration_name),
                ['0_init'],
            );

            const tables = await pglite.query<{tablename: string}>(
                "select tablename from pg_tables where schemaname = 'public' and tablename = 'User'",
            );
            assert.isLengthExactly(tables.rows, 1);
        });
    });
});

describe(readSchemaContainers.name, () => {
    it('reads a single schema file', async (testContext) => {
        const dirPath = join(tmpdir(), `prisma-pglite-test-${randomUUID()}`);
        await mkdir(dirPath, {
            recursive: true,
        });
        const schemaPath = join(dirPath, 'schema.prisma');
        await writeFile(schemaPath, schema(userModel));

        try {
            const containers = await readSchemaContainers(schemaPath);
            assert.isLengthExactly(containers, 1);
            assert.strictEquals(containers[0].path, schemaPath);
            assert.isIn('model User', containers[0].content);
        } finally {
            await rm(dirPath, {
                recursive: true,
                force: true,
            });
        }
    });

    it('reads a schema folder of .prisma files', async () => {
        const dirPath = join(tmpdir(), `prisma-pglite-test-${randomUUID()}`);
        await mkdir(dirPath, {
            recursive: true,
        });
        await writeFile(join(dirPath, 'a.prisma'), schema(userModel));
        await writeFile(join(dirPath, 'b.prisma'), 'model Post {\n    id String @id\n}\n');
        await writeFile(join(dirPath, 'ignore.txt'), 'not a schema');

        try {
            const containers = await readSchemaContainers(dirPath);
            assert.isLengthExactly(containers, 2);
            assert.deepEquals(containers.map((container) => container.path).toSorted(), [
                join(dirPath, 'a.prisma'),
                join(dirPath, 'b.prisma'),
            ]);
        } finally {
            await rm(dirPath, {
                recursive: true,
                force: true,
            });
        }
    });

    it('returns an empty list for a folder with no .prisma files', async () => {
        const dirPath = join(tmpdir(), `prisma-pglite-test-${randomUUID()}`);
        await mkdir(dirPath, {
            recursive: true,
        });
        await writeFile(join(dirPath, 'readme.md'), 'not a schema');

        try {
            assert.isEmpty(await readSchemaContainers(dirPath));
        } finally {
            await rm(dirPath, {
                recursive: true,
                force: true,
            });
        }
    });
});

describe(readMigrationList.name, () => {
    it('returns an empty list for a missing directory', async () => {
        const migrationList = await readMigrationList(join(tmpdir(), `missing-${randomUUID()}`));
        assert.isEmpty(migrationList.migrationDirectories);
        assert.strictEquals(migrationList.lockfile.content, null);
    });

    it('reads migration directories sorted, with lockfile contents', async () => {
        const dirPath = join(tmpdir(), `prisma-pglite-test-${randomUUID()}`);
        await mkdir(join(dirPath, '2_second'), {
            recursive: true,
        });
        await mkdir(join(dirPath, '1_first'), {
            recursive: true,
        });
        await writeFile(join(dirPath, '1_first', 'migration.sql'), 'SELECT 1;');
        await writeFile(join(dirPath, '2_second', 'migration.sql'), 'SELECT 2;');
        await writeFile(join(dirPath, 'migration_lock.toml'), 'provider = "postgresql"');

        try {
            const migrationList = await readMigrationList(dirPath);
            assert.deepEquals(
                migrationList.migrationDirectories.map((entry) => entry.path),
                [
                    '1_first',
                    '2_second',
                ],
            );
            assert.strictEquals(migrationList.lockfile.content, 'provider = "postgresql"');
        } finally {
            await rm(dirPath, {
                recursive: true,
                force: true,
            });
        }
    });
});
