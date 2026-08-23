import { describe, expect, it } from 'vitest';

import { copy } from '../../../lib/copy';
import { initialGoalValue } from '../../goal/goal';

describe('no-history onboarding goal', () => {
  it('offers no litres and advances without setting a mark', () => {
    const visibleCopy = [
      copy.onboarding.mark.title,
      copy.onboarding.mark.body,
      copy.onboarding.mark.action,
      copy.onboarding.mark.note,
    ].join(' ');

    expect(initialGoalValue(null, null)).toBeNull();
    expect(visibleCopy).not.toMatch(/\b\d[\d,]*\s*(?:L|litres)\b/i);
    expect(copy.onboarding.mark.actionHint).toContain('mark stays open');
  });
});
