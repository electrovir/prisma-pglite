import {assert} from '@augment-vir/assert';
import {type BasePrismaClient} from '@augment-vir/common';

export async function verifyPrismaClient(prismaClient: BasePrismaClient) {
    const mockUserData = {
        email: 'test@example.com',

        password: 'fake',
    };

    await prismaClient.user.create({
        data: mockUserData,
    });

    assert.deepEquals(
        await prismaClient.user.findFirst({
            select: {
                email: true,
                password: true,
            },
        }),
        mockUserData,
    );
}
