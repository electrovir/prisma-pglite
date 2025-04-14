import {prisma} from '@augment-vir/node';
import {mockPrismaSchema} from './file-paths.mock.js';

export async function setupPrisma() {
    await prisma.client.generate(mockPrismaSchema);

    /* node:coverage ignore next 1: dynamic imports do not have branches */
    const {PrismaClient} = await import('@prisma/client');

    return PrismaClient;
}
