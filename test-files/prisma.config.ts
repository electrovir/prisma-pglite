import {defineConfig} from 'prisma/config';

/**
 * Prisma v7 reads the schema location and datasource from this config file rather than from the
 * schema itself. This config is only used to generate the mock Prisma client for this package's
 * tests; the datasource URL is a placeholder because the tests run against PGlite via the adapter,
 * not a live Postgres server.
 */
export default defineConfig({
    schema: 'schema.prisma',
    datasource: {
        url: 'postgresql://prisma-pglite@localhost:5432/prisma-pglite',
    },
});
