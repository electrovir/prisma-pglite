import {prismaApi} from 'prisma-vir';
import {mockPrismaSchema} from './file-paths.mock.js';

export async function setupPrisma() {
    await prismaApi.client.generate({
        schemaPath: mockPrismaSchema,
    });

    /* node:coverage ignore next 1: dynamic imports do not have branches */
    const {PrismaClient} = await import('../generated/client.js');

    return PrismaClient;
}
