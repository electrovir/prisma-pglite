import {wrapPromiseInTimeout} from '@augment-vir/common';
import {describe, it} from '@augment-vir/test';

describe('index.ts', () => {
    it('can be imported without error', async () => {
        await wrapPromiseInTimeout({seconds: 10}, import('./index.js'));
    });
});
