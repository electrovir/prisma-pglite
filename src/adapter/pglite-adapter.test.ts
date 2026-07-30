import {assert} from '@augment-vir/assert';
import {describe, extractTestNameAsDir, it, type UniversalTestContext} from '@augment-vir/test';
import {existsSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {join} from 'node:path';
import {Color} from '../generated/enums.js';
import {mockPrismaConfig, notCommittedDirPath} from '../util/file-paths.mock.js';
import {writeMockPrismaConfig} from '../util/mock-prisma-config.mock.js';
import {setupPrisma} from '../util/setup-prisma.mock.js';
import {createPgliteAdapter, type PrismaPgliteAdapter} from './pglite-adapter.js';
import {verifyPrismaClient} from './pglite-adapter.mock.js';

describe(createPgliteAdapter.name, () => {
    it('creates a functioning adapter', async (testContext) => {
        const PrismaClient = await setupPrisma();

        const adapter = await createPgliteAdapter({
            dbDirName: testContext,
            resetDatabase: true,
            prismaConfigPath: mockPrismaConfig,
        });

        assert.strictEquals(
            adapter.databaseDirPath,
            join(notCommittedDirPath, 'pglite', extractTestNameAsDir(testContext)),
        );

        await verifyPrismaClient(
            new PrismaClient({
                adapter,
            }),
        );
    });
    it('creates a functioning adapter with a string dbDirName', async () => {
        const PrismaClient = await setupPrisma();

        const adapter = await createPgliteAdapter({
            dbDirName: 'my name',
            resetDatabase: true,
            prismaConfigPath: mockPrismaConfig,
        });

        assert.strictEquals(
            adapter.databaseDirPath,
            join(notCommittedDirPath, 'pglite', 'my name'),
        );

        await verifyPrismaClient(
            new PrismaClient({
                adapter,
            }),
        );
    });
    it('supports databaseName', async (testContext) => {
        const PrismaClient = await setupPrisma();

        const adapter = await createPgliteAdapter({
            dbDirName: testContext,
            resetDatabase: true,
            prismaConfigPath: mockPrismaConfig,
            databaseName: 'db1',
        });

        const prismaClient = new PrismaClient({
            adapter,
        });

        assert.strictEquals(
            adapter.databaseDirPath,
            join(
                notCommittedDirPath,
                'pglite',
                'create_pglite_adapter_supports_database_name',
                'db1',
            ),
        );

        assert.isTrue(existsSync(adapter.databaseDirPath));

        await verifyPrismaClient(prismaClient);
    });
    it('will reset a custom pglite dir with default dev', async () => {
        const PrismaClient = await setupPrisma();
        const customDbParentDirPath = join(notCommittedDirPath, 'tests', 'custom-pglite');
        await rm(customDbParentDirPath, {
            recursive: true,
            force: true,
        });

        const prismaClient = new PrismaClient({
            adapter: await createPgliteAdapter({
                /** Leave this empty to use the default `dev` database. */
                // testContext,
                prismaConfigPath: mockPrismaConfig,
                dbParentDirPath: customDbParentDirPath,
            }),
        });
        assert.isTrue(existsSync(join(customDbParentDirPath, 'dev')));

        await verifyPrismaClient(prismaClient);
        await prismaClient.$disconnect();
        const prismaClient2 = new PrismaClient({
            adapter: await createPgliteAdapter({
                /** Leave this empty to use the default `dev` database. */
                // testContext,
                prismaConfigPath: mockPrismaConfig,
                dbParentDirPath: customDbParentDirPath,
                resetDatabase: true,
            }),
        });
        assert.isTrue(existsSync(join(customDbParentDirPath, 'dev')));
        assert.isEmpty(await prismaClient2.user.findMany());
    });
    it('reads the default config path', async (testContext) => {
        const PrismaClient = await setupPrisma();

        /** This fails because we don't have a Prisma config in the default location. */
        await assert.throws(
            async () => {
                const prismaClient = new PrismaClient({
                    adapter: await createPgliteAdapter({
                        dbDirName: testContext,
                        resetDatabase: true,
                    }),
                });
            },
            {
                matchMessage: 'Failed to initialize PGlite Prisma adapter',
            },
        );
    });
});

type TestPrismaClient = InstanceType<Awaited<ReturnType<typeof setupPrisma>>>;

/**
 * Spins up a fresh PrismaClient backed by a fresh PGlite database with the full mock schema pushed
 * (no migrations), runs the callback against it, then tears everything down.
 */
async function withDataClient(
    testContext: Readonly<UniversalTestContext>,
    callback: (
        prismaClient: TestPrismaClient,
        adapter: Readonly<PrismaPgliteAdapter>,
    ) => Promise<void>,
): Promise<void> {
    const PrismaClient = await setupPrisma();
    const testDirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
    await rm(testDirPath, {
        recursive: true,
        force: true,
    });
    const prismaConfigPath = await writeMockPrismaConfig({
        dirPath: testDirPath,
        migrationsDirPath: join(testDirPath, 'migrations'),
    });
    const adapter = await createPgliteAdapter({
        prismaConfigPath,
        directDatabaseDirPath: join(testDirPath, 'db'),
        resetDatabase: true,
    });
    const prismaClient = new PrismaClient({
        adapter,
    });

    try {
        await callback(prismaClient, adapter);
    } finally {
        await prismaClient.$disconnect();
        await adapter.pgliteClient.close();
        process.exitCode = undefined;
    }
}

describe('adapter data types', () => {
    it('round-trips every scalar type', async (testContext) => {
        await withDataClient(testContext, async (prismaClient) => {
            const created = await prismaClient.dataType.create({
                data: {
                    intField: 42,
                    bigIntField: 9_007_199_254_740_993n,
                    floatField: 3.5,
                    decimalField: '123.456',
                    boolField: true,
                    dateTimeField: '2020-01-02T03:04:05.000Z',
                    jsonField: {
                        a: 1,
                        b: [
                            'x',
                            true,
                        ],
                        c: null,
                    },
                    bytesField: new Uint8Array([
                        0,
                        1,
                        2,
                        250,
                    ]),
                    stringList: [
                        'a',
                        'b',
                        'c',
                    ],
                    intList: [
                        1,
                        2,
                        3,
                    ],
                    color: Color.green,
                },
            });

            const found = await prismaClient.dataType.findUniqueOrThrow({
                where: {
                    id: created.id,
                },
            });

            assert.strictEquals(found.intField, 42);
            assert.strictEquals(found.bigIntField, 9_007_199_254_740_993n);
            assert.strictEquals(found.floatField, 3.5);
            assert.strictEquals(String(found.decimalField), '123.456');
            assert.strictEquals(found.boolField, true);
            assert.strictEquals(found.dateTimeField.toISOString(), '2020-01-02T03:04:05.000Z');
            assert.deepEquals(found.jsonField, {
                a: 1,
                b: [
                    'x',
                    true,
                ],
                c: null,
            });
            assert.deepEquals(
                [...found.bytesField],
                [
                    0,
                    1,
                    2,
                    250,
                ],
            );
            assert.deepEquals(found.stringList, [
                'a',
                'b',
                'c',
            ]);
            assert.deepEquals(
                found.intList,
                [
                    1,
                    2,
                    3,
                ],
            );
            assert.strictEquals(found.color, Color.green);
            assert.strictEquals(found.optionalString, null);
            assert.strictEquals(found.optionalInt, null);
        });
    });

    it('round-trips empty arrays and deeply nested json', async (testContext) => {
        await withDataClient(testContext, async (prismaClient) => {
            const nestedJson = {
                level1: {
                    level2: [
                        {
                            deep: true,
                        },
                    ],
                },
            };
            const created = await prismaClient.dataType.create({
                data: {
                    intField: 0,
                    bigIntField: 0n,
                    floatField: 0,
                    decimalField: '0',
                    boolField: false,
                    dateTimeField: '2021-06-07T08:09:10.123Z',
                    jsonField: nestedJson,
                    bytesField: new Uint8Array([]),
                    stringList: [],
                    intList: [],
                    color: Color.blue,
                },
            });

            const found = await prismaClient.dataType.findUniqueOrThrow({
                where: {
                    id: created.id,
                },
            });

            assert.deepEquals(found.jsonField, nestedJson);
            assert.isEmpty(found.stringList);
            assert.isEmpty(found.intList);
            assert.isLengthExactly([...found.bytesField], 0);
            assert.strictEquals(found.dateTimeField.toISOString(), '2021-06-07T08:09:10.123Z');
        });
    });
});

describe('adapter transactions', () => {
    it('commits an interactive transaction', async (testContext) => {
        await withDataClient(testContext, async (prismaClient) => {
            await prismaClient.$transaction(async (tx) => {
                await tx.user.create({
                    data: {
                        email: 'a@example.com',
                        password: 'pw',
                    },
                });
                await tx.user.create({
                    data: {
                        email: 'b@example.com',
                        password: 'pw',
                    },
                });
            });

            assert.strictEquals(await prismaClient.user.count(), 2);
        });
    });

    it('rolls back a failed interactive transaction', async (testContext) => {
        await withDataClient(testContext, async (prismaClient) => {
            await assert.throws(async () => {
                await prismaClient.$transaction(async (tx) => {
                    await tx.user.create({
                        data: {
                            email: 'a@example.com',
                            password: 'pw',
                        },
                    });
                    throw new Error('rollback please');
                });
            });

            assert.strictEquals(await prismaClient.user.count(), 0);
        });
    });
});

describe('adapter error mapping', () => {
    it('maps unique constraint violations', async (testContext) => {
        await withDataClient(testContext, async (prismaClient) => {
            await prismaClient.region.create({
                data: {
                    regionName: 'duplicate',
                },
            });

            await assert.throws(
                async () =>
                    prismaClient.region.create({
                        data: {
                            regionName: 'duplicate',
                        },
                    }),
                {
                    matchMessage: 'Unique constraint failed',
                },
            );
        });
    });

    it('maps foreign key violations', async (testContext) => {
        await withDataClient(testContext, async (prismaClient) => {
            await assert.throws(
                async () =>
                    prismaClient.userPost.create({
                        data: {
                            title: 'orphan',
                            body: 'no user',
                            userId: 'does-not-exist',
                        },
                    }),
                {
                    matchMessage: 'Foreign key constraint',
                },
            );
        });
    });
});

describe('adapter relations', () => {
    it('supports nested writes, relation includes, and cascade deletes', async (testContext) => {
        await withDataClient(testContext, async (prismaClient) => {
            const user = await prismaClient.user.create({
                data: {
                    email: 'nested@example.com',
                    password: 'pw',
                    posts: {
                        create: [
                            {
                                title: 't1',
                                body: 'b1',
                            },
                            {
                                title: 't2',
                                body: 'b2',
                            },
                        ],
                    },
                    settings: {
                        create: {
                            receivesMarketingEmails: true,
                        },
                    },
                },
                include: {
                    posts: true,
                    settings: true,
                },
            });

            assert.isLengthExactly(user.posts, 2);
            assert.isDefined(user.settings);
            assert.strictEquals(await prismaClient.userPost.count(), 2);
            assert.strictEquals(await prismaClient.userSettings.count(), 1);

            await prismaClient.user.delete({
                where: {
                    id: user.id,
                },
            });

            assert.strictEquals(await prismaClient.userPost.count(), 0);
            assert.strictEquals(await prismaClient.userSettings.count(), 0);
        });
    });
});

describe('adapter raw queries', () => {
    it('runs $queryRaw and $executeRaw through the adapter', async (testContext) => {
        await withDataClient(testContext, async (prismaClient) => {
            await prismaClient.user.create({
                data: {
                    email: 'raw@example.com',
                    password: 'pw',
                },
            });

            const rows = await prismaClient.$queryRaw<Array<{count: number}>>`
                SELECT count(*)::int AS count FROM "User"
            `;
            const countRow = rows[0];
            assert.isDefined(countRow);
            assert.strictEquals(countRow.count, 1);

            const affected = await prismaClient.$executeRaw`
                UPDATE "User" SET "role" = 'admin'
            `;
            assert.strictEquals(affected, 1);
        });
    });

    it('exposes the inner PGlite client', async (testContext) => {
        await withDataClient(testContext, async (_prismaClient, adapter) => {
            const result = await adapter.pgliteClient.query<{one: number}>('SELECT 1 AS one');
            const row = result.rows[0];
            assert.isDefined(row);
            assert.strictEquals(row.one, 1);
        });
    });

    it('round-trips strings with quotes and SQL metacharacters safely', async (testContext) => {
        await withDataClient(testContext, async (prismaClient) => {
            const trickyEmail = `o'brien "; DROP TABLE "User"; --@example.com`;
            const trickyPassword = String.raw`p\w%_'"`;
            const created = await prismaClient.user.create({
                data: {
                    email: trickyEmail,
                    password: trickyPassword,
                },
            });

            const found = await prismaClient.user.findUniqueOrThrow({
                where: {
                    id: created.id,
                },
            });
            assert.strictEquals(found.email, trickyEmail);
            assert.strictEquals(found.password, trickyPassword);

            /** The "DROP TABLE" in the value must have been bound as a parameter, not executed. */
            assert.strictEquals(await prismaClient.user.count(), 1);
        });
    });
});

describe('adapter database lifecycle', () => {
    it('reports wasJustInitialized and reuses an existing database without resetting', async (testContext) => {
        const PrismaClient = await setupPrisma();
        const testDirPath = join(notCommittedDirPath, 'tests', extractTestNameAsDir(testContext));
        await rm(testDirPath, {
            recursive: true,
            force: true,
        });
        const prismaConfigPath = await writeMockPrismaConfig({
            dirPath: testDirPath,
            migrationsDirPath: join(testDirPath, 'migrations'),
        });
        const databaseDirPath = join(testDirPath, 'db');

        const firstAdapter = await createPgliteAdapter({
            prismaConfigPath,
            directDatabaseDirPath: databaseDirPath,
            resetDatabase: true,
        });
        assert.isTrue(firstAdapter.wasJustInitialized);
        assert.strictEquals(firstAdapter.databaseDirPath, databaseDirPath);

        const firstClient = new PrismaClient({
            adapter: firstAdapter,
        });
        await firstClient.user.create({
            data: {
                email: 'persist@example.com',
                password: 'pw',
            },
        });
        await firstClient.$disconnect();
        await firstAdapter.pgliteClient.close();
        process.exitCode = undefined;

        /** Re-open the same database directory without resetting it. */
        const secondAdapter = await createPgliteAdapter({
            prismaConfigPath,
            directDatabaseDirPath: databaseDirPath,
        });
        assert.isFalse(secondAdapter.wasJustInitialized);

        const secondClient = new PrismaClient({
            adapter: secondAdapter,
        });
        assert.strictEquals(await secondClient.user.count(), 1);
        await secondClient.$disconnect();
        await secondAdapter.pgliteClient.close();
        process.exitCode = undefined;
    });
});
