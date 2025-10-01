import {PrismaClient} from '../generated/client.js';
import {createPgliteAdapter} from '../index.js';

const prismaClient = new PrismaClient({
    adapter: await createPgliteAdapter(),
});
