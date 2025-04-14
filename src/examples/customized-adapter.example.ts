import {PrismaClient} from '@prisma/client';
import {join} from 'node:path';
import {createPgliteAdapter} from '../index.js';

const mySchemaPath = join('packages', 'backend', 'prisma', 'schema.prisma');

const prismaClient = new PrismaClient({
    adapter: await createPgliteAdapter({
        schemaFilePath: mySchemaPath,
        pgliteDirPath: join('.dev', 'pglite'),
    }),
});
