import {join} from 'node:path';
import {PrismaClient} from '../generated/client.js';
import {createPgliteAdapter} from '../index.js';

const mySchemaPath = join('packages', 'backend', 'prisma', 'schema.prisma');
const myMigrationsDirPath = join('packages', 'backend', 'prisma', 'migrations');

const prismaClient = new PrismaClient({
    adapter: await createPgliteAdapter({
        schemaFilePath: mySchemaPath,
        migrationsDirPath: myMigrationsDirPath,
        dbParentDirPath: join('.dev', 'pglite'),
    }),
});
