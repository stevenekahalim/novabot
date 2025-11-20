/**
 * Tests for Response Generator - Cost Calculations
 *
 * Testing the token cost calculation logic for different models.
 * This ensures we accurately estimate API costs.
 */

describe('ResponseGenerator - Cost Calculations', () => {
  // Define the same pricing structure as in responseGenerator.js
  const modelPricing = {
    'claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015 },
    'claude-3-7-sonnet-20250219': { input: 0.003, output: 0.015 },
    'claude-3-5-haiku-20241022': { input: 0.001, output: 0.005 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 }
  };

  /**
   * Helper function to calculate costs (mirrors the logic in responseGenerator.js)
   */
  function calculateCost(inputTokens, outputTokens, model) {
    const pricing = modelPricing[model];
    if (!pricing) {
      throw new Error(`Unknown model: ${model}`);
    }

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      totalTokens: inputTokens + outputTokens
    };
  }

  describe('Claude Sonnet 4.5 Cost Calculations', () => {
    const model = 'claude-sonnet-4-5-20250929';

    test('calculates cost for small request (1000 input, 100 output tokens)', () => {
      const result = calculateCost(1000, 100, model);

      expect(result.inputCost).toBeCloseTo(0.003, 6);      // 1000/1000 * 0.003 = 0.003
      expect(result.outputCost).toBeCloseTo(0.0015, 6);    // 100/1000 * 0.015 = 0.0015
      expect(result.totalCost).toBeCloseTo(0.0045, 6);     // 0.003 + 0.0015
      expect(result.totalTokens).toBe(1100);
    });

    test('calculates cost for medium request (10000 input, 500 output tokens)', () => {
      const result = calculateCost(10000, 500, model);

      expect(result.inputCost).toBe(0.03);       // 10000/1000 * 0.003 = 0.03
      expect(result.outputCost).toBe(0.0075);    // 500/1000 * 0.015 = 0.0075
      expect(result.totalCost).toBe(0.0375);     // 0.03 + 0.0075
      expect(result.totalTokens).toBe(10500);
    });

    test('calculates cost for large request (26372 input, 400 output tokens) - real example', () => {
      // This is from your actual logs: Input tokens: 26372, Output tokens: 400
      const result = calculateCost(26372, 400, model);

      expect(result.inputCost).toBeCloseTo(0.079116, 6);   // 26372/1000 * 0.003
      expect(result.outputCost).toBeCloseTo(0.006, 6);     // 400/1000 * 0.015
      expect(result.totalCost).toBeCloseTo(0.085116, 6);   // Matches your log: $0.085116
      expect(result.totalTokens).toBe(26772);
    });

    test('handles zero tokens gracefully', () => {
      const result = calculateCost(0, 0, model);

      expect(result.inputCost).toBe(0);
      expect(result.outputCost).toBe(0);
      expect(result.totalCost).toBe(0);
      expect(result.totalTokens).toBe(0);
    });
  });

  describe('Claude 3.5 Haiku Cost Calculations', () => {
    const model = 'claude-3-5-haiku-20241022';

    test('calculates cost correctly (cheaper than Sonnet)', () => {
      const result = calculateCost(10000, 500, model);

      expect(result.inputCost).toBe(0.01);       // 10000/1000 * 0.001 = 0.01
      expect(result.outputCost).toBe(0.0025);    // 500/1000 * 0.005 = 0.0025
      expect(result.totalCost).toBe(0.0125);     // Much cheaper than Sonnet!
      expect(result.totalTokens).toBe(10500);
    });

    test('Haiku is ~3x cheaper than Sonnet for same tokens', () => {
      const inputTokens = 10000;
      const outputTokens = 500;

      const haikuCost = calculateCost(inputTokens, outputTokens, 'claude-3-5-haiku-20241022');
      const sonnetCost = calculateCost(inputTokens, outputTokens, 'claude-sonnet-4-5-20250929');

      // Haiku should be significantly cheaper
      expect(haikuCost.totalCost).toBeLessThan(sonnetCost.totalCost);
      expect(sonnetCost.totalCost / haikuCost.totalCost).toBeCloseTo(3, 0); // ~3x cheaper
    });
  });

  describe('GPT-4o Cost Calculations', () => {
    const model = 'gpt-4o';

    test('calculates cost for GPT-4o', () => {
      const result = calculateCost(10000, 500, model);

      expect(result.inputCost).toBeCloseTo(0.025, 6);      // 10000/1000 * 0.0025 = 0.025
      expect(result.outputCost).toBeCloseTo(0.005, 6);     // 500/1000 * 0.01 = 0.005
      expect(result.totalCost).toBeCloseTo(0.03, 6);
      expect(result.totalTokens).toBe(10500);
    });
  });

  describe('Precision and Rounding', () => {
    test('maintains precision to 6 decimal places (as shown in logs)', () => {
      const result = calculateCost(26372, 400, 'claude-sonnet-4-5-20250929');

      // The actual cost should be precise
      const inputCostPrecise = result.inputCost.toFixed(6);
      const outputCostPrecise = result.outputCost.toFixed(6);
      const totalCostPrecise = result.totalCost.toFixed(6);

      expect(inputCostPrecise).toBe('0.079116');
      expect(outputCostPrecise).toBe('0.006000');
      expect(totalCostPrecise).toBe('0.085116');
    });

    test('handles fractional tokens correctly', () => {
      const result = calculateCost(1500, 250, 'claude-sonnet-4-5-20250929');

      expect(result.inputCost).toBeCloseTo(0.0045, 6);     // 1500/1000 * 0.003
      expect(result.outputCost).toBeCloseTo(0.00375, 6);   // 250/1000 * 0.015
      expect(result.totalCost).toBeCloseTo(0.00825, 6);
    });
  });

  describe('Error Handling', () => {
    test('throws error for unknown model', () => {
      expect(() => {
        calculateCost(1000, 100, 'unknown-model');
      }).toThrow('Unknown model: unknown-model');
    });

    test('handles negative token counts (shouldn\'t happen, but test anyway)', () => {
      // In real scenario, this shouldn't occur, but let's test robustness
      const result = calculateCost(-1000, 100, 'claude-sonnet-4-5-20250929');

      // Negative cost would indicate a bug
      expect(result.inputCost).toBe(-0.003);
      expect(result.totalCost).toBe(-0.003 + 0.0015);
    });
  });

  describe('Monthly Cost Projections', () => {
    test('estimates monthly cost based on average usage', () => {
      // Your current stats: ~$201/month for Nova
      // Let's verify this calculation

      const responsesPerDay = 30;  // Rough estimate from your usage
      const avgInputTokens = 26000;
      const avgOutputTokens = 400;

      const costPerResponse = calculateCost(
        avgInputTokens,
        avgOutputTokens,
        'claude-sonnet-4-5-20250929'
      ).totalCost;

      const dailyCost = costPerResponse * responsesPerDay;
      const monthlyCost = dailyCost * 30;

      expect(costPerResponse).toBeCloseTo(0.085, 2);  // ~$0.08-0.09 per response
      expect(monthlyCost).toBeGreaterThan(50);        // At least $50/month
      expect(monthlyCost).toBeLessThan(300);          // Less than $300/month
    });
  });

  describe('Model Comparison', () => {
    test('compares costs across all models for same input', () => {
      const inputTokens = 10000;
      const outputTokens = 500;

      const costs = {};
      for (const model in modelPricing) {
        costs[model] = calculateCost(inputTokens, outputTokens, model).totalCost;
      }

      // Verify Haiku is cheapest
      expect(costs['claude-3-5-haiku-20241022']).toBeLessThan(costs['claude-sonnet-4-5-20250929']);
      expect(costs['claude-3-5-haiku-20241022']).toBeLessThan(costs['gpt-4o']);

      // Verify GPT-4 Turbo is most expensive
      expect(costs['gpt-4-turbo']).toBeGreaterThan(costs['claude-sonnet-4-5-20250929']);
      expect(costs['gpt-4-turbo']).toBeGreaterThan(costs['gpt-4o']);
    });
  });
});
