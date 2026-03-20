import { describe, it, expect } from 'vitest';
import { validateInput, getCompleteness } from './utils';

describe('validateInput', () => {
  it('should return error for empty input', () => {
    const result = validateInput('');
    expect(result).not.toBeNull();
    expect(result?.error).toContain('Insufficient input');
  });

  it('should return error for short input', () => {
    const result = validateInput('abc');
    expect(result).not.toBeNull();
    expect(result?.error).toContain('Insufficient input');
  });

  it('should return null for valid input', () => {
    const result = validateInput('Patient has severe headache.');
    expect(result).toBeNull();
  });
});

describe('getCompleteness', () => {
  it('should return 0.3 for short input', () => {
    expect(getCompleteness('short')).toBe(0.3);
  });

  it('should return 0.5 for medium input', () => {
    expect(getCompleteness('This is a medium length input for testing.')).toBe(0.5);
  });

  it('should return 0.7 for long input', () => {
    expect(getCompleteness('This is a longer input that should trigger the 0.7 completeness score threshold in our utility function.')).toBe(0.7);
  });

  it('should return 0.9 for very long input', () => {
    expect(getCompleteness('This is a very long input that should trigger the 0.9 completeness score threshold in our utility function. It needs to be over 100 characters long to reach this level of completeness according to the rules.')).toBe(0.9);
  });
});
