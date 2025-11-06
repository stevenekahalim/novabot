const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

/**
 * Supabase Client for V3 Architecture
 * V3 uses: messages_v3, hourly_notes
 */
class SupabaseClient {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is required in environment variables');
    }

    if (!supabaseKey) {
      throw new Error('SUPABASE_SERVICE_KEY is required for backend operations. Get it from Supabase dashboard → Settings → API → service_role key');
    }

    // Log which key type is being used (first 20 chars for security)
    logger.info(`Using Supabase service_role key: ${supabaseKey.substring(0, 20)}...`);

    this.client = createClient(supabaseUrl, supabaseKey);
    this.isConnected = false;

    this.testConnection();
  }

  async testConnection() {
    try {
      // Test connection using V3 tables
      const { data, error } = await this.client
        .from('messages_v3')
        .select('count')
        .limit(1);

      if (error) throw error;

      this.isConnected = true;
      logger.info('✅ Supabase connection successful');
    } catch (error) {
      this.isConnected = false;
      logger.error('❌ Supabase connection failed:', error.message);
    }
  }

  getClient() {
    return this.client;
  }

  isHealthy() {
    return this.isConnected;
  }
}

module.exports = SupabaseClient;
