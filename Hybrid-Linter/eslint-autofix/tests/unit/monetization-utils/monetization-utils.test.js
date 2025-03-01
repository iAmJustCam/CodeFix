import assert from 'assert';
import { isFeatureAvailable, getCurrentPlan } from '../../../monetization-utils.js';
import { config } from '../../../state.js';

describe('Monetization Utils', () => {
  // Save original license key
  const originalLicenseKey = config.LICENSE_KEY;
  
  it('should correctly identify feature availability based on plan', () => {
    // Test free plan
    config.LICENSE_KEY = null;
    
    assert.strictEqual(isFeatureAvailable('basic_linting'), true);
    assert.strictEqual(isFeatureAvailable('ai_analysis'), false);
    assert.strictEqual(isFeatureAvailable('team_profiles'), false);
    
    // Test pro plan
    config.LICENSE_KEY = 'pro-test';
    assert.strictEqual(getCurrentPlan(), 'PRO');
    assert.strictEqual(isFeatureAvailable('ai_analysis'), true);
    assert.strictEqual(isFeatureAvailable('team_profiles'), false);
    
    // Test team plan
    config.LICENSE_KEY = 'team-test';
    assert.strictEqual(getCurrentPlan(), 'TEAM');
    assert.strictEqual(isFeatureAvailable('team_profiles'), true);
    
    // Test enterprise plan
    config.LICENSE_KEY = 'enterprise-test';
    assert.strictEqual(getCurrentPlan(), 'ENTERPRISE');
    assert.strictEqual(isFeatureAvailable('custom_languages'), true);
  });
  
  after(() => {
    // Restore original license key
    config.LICENSE_KEY = originalLicenseKey;
  });
});
