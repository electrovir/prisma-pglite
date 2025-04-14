import {PrismaClient} from '@prisma/client';
import {createPgliteAdapter} from '../index.js';

const prismaClient = new PrismaClient({
    adapter: await createPgliteAdapter(),
});
