import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { AutoUpdateChecker } from '../../src/utils/auto-update.js';

describe('AutoUpdateChecker.checkInBackground', () => {
  const origCI = process.env.CI;
  const origNoUpdate = process.env.NO_UPDATE_CHECK;

  afterEach(() => {
    // Restore env
    process.env.CI = origCI;
    process.env.NO_UPDATE_CHECK = origNoUpdate;
  });

  test('skips check when CI is set', async () => {
    process.env.CI = '1';
    // Should return immediately without error
    await AutoUpdateChecker.checkInBackground();
  });

  test('skips check when NO_UPDATE_CHECK is set', async () => {
    delete process.env.CI;
    process.env.NO_UPDATE_CHECK = '1';
    await AutoUpdateChecker.checkInBackground();
  });
});
