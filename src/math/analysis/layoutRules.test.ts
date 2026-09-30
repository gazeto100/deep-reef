import { describe, expect, it } from 'vitest';
import { findLayoutViolations, type LayoutRules } from './layoutRules';

const rules: LayoutRules<string> = { scatter: 'S', rowCount: 3, stackable: ['H'], maxStack: 3 };

describe('findLayoutViolations', () => {
  it('accepts a strip with stacks of stackable symbols up to maxStack', () => {
    expect(findLayoutViolations(['H', 'H', 'H', 'A', 'B', 'S', 'A', 'B', 'C'], rules)).toEqual([]);
  });

  it('rejects stacks longer than maxStack, including across the wrap-around', () => {
    expect(findLayoutViolations(['H', 'H', 'H', 'H', 'A', 'B'], rules)).toHaveLength(1);
    expect(findLayoutViolations(['H', 'H', 'A', 'B', 'H', 'H'], rules)).toHaveLength(1);
  });

  it('rejects neighbours of non-stackable symbols', () => {
    expect(findLayoutViolations(['A', 'A', 'B', 'C'], rules)).toEqual(['A x2 at 0 (max 1)']);
    expect(findLayoutViolations(['A', 'B', 'C', 'A'], rules)).toHaveLength(1); // circular
  });

  it('rejects two scatters within one window', () => {
    expect(findLayoutViolations(['S', 'A', 'S', 'B', 'C', 'D'], rules)).toHaveLength(1);
    expect(findLayoutViolations(['A', 'S', 'B', 'C', 'D', 'S'], rules)).toHaveLength(1); // circular
    expect(findLayoutViolations(['S', 'A', 'B', 'S', 'C', 'D'], rules)).toEqual([]);
  });
});
