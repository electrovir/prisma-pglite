import {rm} from 'node:fs/promises';
import {prismaApi} from 'prisma-vir';
import {generatedOutputDirPath, mockPrismaSchema} from './file-paths.mock.js';

export async function setupPrisma() {
    await rm(generatedOutputDirPath, {
        force: true,
        recursive: true,
    });
    await prismaApi.client.generate({
        schemaPath: mockPrismaSchema,
    });

    /* node:coverage ignore next 1: dynamic imports do not have branches */
    const {PrismaClient} = await import('../generated/client.js');

    return PrismaClient;
}
