# prisma-pglite

Enabling easy [Prisma](https://www.npmjs.com/package/prisma) usage with [PGlite](https://pglite.dev). This includes a runtime adapter helper and a CLI Prisma wrapper:

-   **CLI**

    -   Enables `prisma migrate dev` with a PGlite database.
    -   Enables `prisma migrate reset` with a PGlite database.
    -   Passes all other commands to the standard `prisma` CLI.

-   **adapter helper**

    -   Includes and wraps [pglite-prisma-adapter](https://www.npmjs.com/package/pglite-prisma-adapter).
    -   Automatically propagates your schema to the PGlite database (similar to `prisma db push` but lacking the ability to apply new migrations to an existing PGlite database).

See the full reference docs at https://electrovir.github.io/prisma-pglite

## Install

```sh
npm i prisma-pglite
```

## Usage

### tl;dr

-   Set the `driverAdapters` preview feature in your `schema.prisma`:
    ```prisma
    generator client {
        provider        = "prisma-client-js"
        previewFeatures = ["driverAdapters"]
    }
    ```
-   Use `createPgliteAdapter`:
    <!-- example-link: src/examples/basic-adapter.example.ts -->

    ```TypeScript
    import {PrismaClient} from '../generated/client.js';
    import {createPgliteAdapter} from 'prisma-pglite';

    const prismaClient = new PrismaClient({
        adapter: await createPgliteAdapter(),
    });
    ```

-   Create new migrations with `npx prisma-pglite migrate dev`

### CLI

Instead of running Prisma commands like this:

```sh
npx prisma migrate dev
```

Run them like this:

```sh
npx prisma-pglite migrate dev
```

The `prisma-pglite` CLI will:

-   Intercept `migrate dev` commands so that they work without running a full Postgres instance.
    -   Use `--schema <schema-path>` to customize the schema location.
    -   Use `--name <migration-name>` to provide the migration name inline (otherwise the CLI will prompt you for one).
    -   Use `--migrations <migrations-dir-path>` to customize the location of your `migrations` folder.
    -   Note that this command will generate a `source.snapshot` (customizable with `--snapshot <snapshot-file-name>`) file inside each migration. You _must_ keep and commit this file otherwise this command will not work in the future (this file is used to keep track of migration progress instead of a postgres instance, as Prisma normally uses).
-   Intercept `migrate reset` commands so that they work with a PGlite database.
    -   Use `--schema <schema-path>` to customize the schema location.
    -   Use `--database <pglite-db-parent-dir-path>` to customize the location of your PGlite database that needs to be reset.
-   Automatically append `--no-hints` to the `prisma generate` command.
-   Pass all other commands directly to the Prisma CLI without modification.

All CLI commands are also accessible via the exported API:

-   `migrate dev`:
    <!-- example-link: src/examples/migrate-dev-api.example.ts -->

    ```TypeScript
    import {createPgliteMigration} from 'prisma-pglite';

    await createPgliteMigration({
        migrationName: 'my migration',
    });
    ```

-   `migrate reset`:
    <!-- example-link: src/examples/reset-api.example.ts -->

    ```TypeScript
    import {resetPgliteDatabase} from 'prisma-pglite';

    await resetPgliteDatabase();
    ```

-   the whole CLI:
    <!-- example-link: src/examples/cli-api.example.ts -->

    ```TypeScript
    import {runPrisma} from 'prisma-pglite';

    await runPrisma(['migrate dev']);
    await runPrisma(['generate']);
    ```

### Adapter Helper

Use this when instantiating your `PrismaClient` instance to connect to or create a PGlite database:

<!-- example-link: src/examples/adapter.example.ts -->

```TypeScript
import {join} from 'node:path';
import {PrismaClient} from '../generated/client.js';
import {createPgliteAdapter} from 'prisma-pglite';

const mySchemaPath = join('packages', 'backend', 'prisma', 'schema.prisma');
const myMigrationsDirPath = join('packages', 'backend', 'prisma', 'migrations');

const prismaClient = new PrismaClient({
    adapter: await createPgliteAdapter({
        schemaFilePath: mySchemaPath,
        migrationsDirPath: myMigrationsDirPath,
    }),
});
```

**NOTE**: `createPgliteAdapter` can only push your schema to _new_ PGlite databases. Thus, you'll need to reset your dev database whenever you create a new migration (I suggest investing in a seed script to workaround this and make your dev experience more consistent in general).

See the type [`PgliteAdapterParams`](https://electrovir.github.io/prisma-pglite/types/PgliteAdapterParams.html) for more details on customizing `createPgliteAdapter`.

Make sure that you have the [`driverAdapters` preview feature enabled](https://www.prisma.io/docs/orm/overview/databases/database-drivers#how-to-use-driver-adapters) in your `schema.prisma`. If you don't enable this, your `PrismaClient` constructor won't have an `adapter` parameter available.

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}
```

#### PGlite paths

By default, the `pgliteDirPath` parameter of `createPgliteAdapter` expects multiple PGlite database to exist within itself. The default database will be in `${pgliteDirPath}/dev` and all test database (triggered by passing in the `testContext` parameter) will be in `${pgliteDirPath}/${testName}`. This structure can be ignored entirely by instead setting the `directDatabaseDirPath` parameter, but then you lose automatic test database paths.

### Examples

-   Create a new migration with some flags:
    ```sh
    npx prisma-pglite migrate dev --schema packages/backend/prisma/schema.prisma --name 'add user table'
    ```
-   Reset your PGlite database
    ```sh
    npx prisma-pglite migrate reset --database .config/pglite-db
    ```
-   Customize the PGlite adapter:
    <!-- example-link: src/examples/customized-adapter.example.ts -->

    ```TypeScript
    import {join} from 'node:path';
    import {PrismaClient} from '../generated/client.js';
    import {createPgliteAdapter} from 'prisma-pglite';

    const mySchemaPath = join('packages', 'backend', 'prisma', 'schema.prisma');
    const myMigrationsDirPath = join('packages', 'backend', 'prisma', 'migrations');

    const prismaClient = new PrismaClient({
        adapter: await createPgliteAdapter({
            schemaFilePath: mySchemaPath,
            migrationsDirPath: myMigrationsDirPath,
            dbParentDirPath: join('.dev', 'pglite'),
        }),
    });
    ```

-   Create a fresh and super fast PGlite database instance for each test:
    <!-- example-link: src/examples/test-context.example.ts -->

    ```TypeScript
    import {describe, it} from '@augment-vir/test';
    import {join} from 'node:path';
    import {PrismaClient} from '../generated/client.js';
    import {createPgliteAdapter} from 'prisma-pglite';

    const mySchemaPath = join('packages', 'backend', 'prisma', 'schema.prisma');
    const myMigrationsDirPath = join('packages', 'backend', 'prisma', 'migrations');

    describe('my test', () => {
        it('connects to the database', async (testContext) => {
            const prismaClient = new PrismaClient({
                adapter: await createPgliteAdapter({
                    schemaFilePath: mySchemaPath,
                    migrationsDirPath: myMigrationsDirPath,
                    dbParentDirPath: join('.dev', 'pglite'),
                    dbDirName: testContext,
                    /** It is recommended to always reset the database for tests. */
                    resetDatabase: true,
                }),
            });
        });
    });
    ```
