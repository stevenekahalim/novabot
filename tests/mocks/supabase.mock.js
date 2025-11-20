/**
 * Mock Supabase Client
 *
 * This mocks the Supabase database for testing without hitting the real database.
 * Allows us to test database queries with predictable data.
 */

class MockSupabaseClient {
  constructor() {
    this.mockData = {
      messages_v3: [],
      knowledge_base: [],
      hourly_notes: [],
      daily_digests_v3: []
    };
  }

  /**
   * Set mock data for a table
   */
  setMockData(table, data) {
    this.mockData[table] = data;
  }

  /**
   * Mock the from() method
   */
  from(table) {
    return new MockQueryBuilder(this.mockData[table] || []);
  }

  /**
   * Reset all mock data
   */
  reset() {
    this.mockData = {
      messages_v3: [],
      knowledge_base: [],
      hourly_notes: [],
      daily_digests_v3: []
    };
  }
}

class MockQueryBuilder {
  constructor(data) {
    this.data = [...data]; // Clone to avoid mutations
    this.filters = [];
  }

  /**
   * Mock select()
   */
  select(columns = '*') {
    return this;
  }

  /**
   * Mock eq() - equality filter
   */
  eq(column, value) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  /**
   * Mock gte() - greater than or equal
   */
  gte(column, value) {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }

  /**
   * Mock lte() - less than or equal
   */
  lte(column, value) {
    this.filters.push({ type: 'lte', column, value });
    return this;
  }

  /**
   * Mock order()
   */
  order(column, options = {}) {
    this.orderColumn = column;
    this.orderOptions = options;
    return this;
  }

  /**
   * Mock limit()
   */
  limit(count) {
    this.limitCount = count;
    return this;
  }

  /**
   * Execute the query and return results
   */
  async then(resolve, reject) {
    try {
      let result = [...this.data];

      // Apply filters
      for (const filter of this.filters) {
        if (filter.type === 'eq') {
          result = result.filter(row => row[filter.column] === filter.value);
        } else if (filter.type === 'gte') {
          result = result.filter(row => new Date(row[filter.column]) >= new Date(filter.value));
        } else if (filter.type === 'lte') {
          result = result.filter(row => new Date(row[filter.column]) <= new Date(filter.value));
        }
      }

      // Apply ordering
      if (this.orderColumn) {
        const ascending = this.orderOptions.ascending !== false;
        result.sort((a, b) => {
          const aVal = a[this.orderColumn];
          const bVal = b[this.orderColumn];
          if (aVal < bVal) return ascending ? -1 : 1;
          if (aVal > bVal) return ascending ? 1 : -1;
          return 0;
        });
      }

      // Apply limit
      if (this.limitCount) {
        result = result.slice(0, this.limitCount);
      }

      const response = { data: result, error: null };
      return resolve ? resolve(response) : response;
    } catch (error) {
      const response = { data: null, error };
      return reject ? reject(response) : response;
    }
  }
}

module.exports = {
  MockSupabaseClient,
  MockQueryBuilder
};
