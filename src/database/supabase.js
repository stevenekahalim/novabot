const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

class SupabaseClient {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials missing in environment variables');
    }

    this.client = createClient(supabaseUrl, supabaseKey);
    this.isConnected = false;

    this.testConnection();
  }

  async testConnection() {
    try {
      const { data, error } = await this.client
        .from('projects')
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

  async upsertProject(projectData) {
    try {
      logger.info(`Upserting project: ${projectData.name}`);

      const { data, error } = await this.client
        .from('projects')
        .upsert({
          name: projectData.name,
          location: projectData.location || projectData.name,
          status: projectData.status || 'planning',
          pic: projectData.pic || null,
          monthly_cost: projectData.monthly_cost || null,
          phase: projectData.phase || null,
          last_update: new Date().toISOString(),
          next_action: projectData.next_action || null,
          target_launch: projectData.target_launch || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'name',
          returning: 'representation'
        })
        .select()
        .single();

      if (error) throw error;

      logger.info(`✅ Project upserted: ${data.id}`);
      return data;
    } catch (error) {
      logger.error('Error upserting project:', error);
      throw error;
    }
  }

  async getProjectByName(name) {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .ilike('name', `%${name}%`)
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Error getting project ${name}:`, error);
      return null;
    }
  }

  async getAllProjects() {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .order('last_update', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting all projects:', error);
      return [];
    }
  }

  async logUpdate(updateData) {
    try {
      logger.info(`Logging update for project: ${updateData.project_id}`);

      const { data, error} = await this.client
        .from('updates_log')
        .insert({
          project_id: updateData.project_id,
          date: new Date().toISOString(),
          author: updateData.author,
          update_text: updateData.update_text,
          message_type: updateData.message_type,
          whatsapp_message_id: updateData.whatsapp_message_id || null
        })
        .select()
        .single();

      if (error) throw error;

      logger.info(`✅ Update logged: ${data.id}`);
      return data;
    } catch (error) {
      logger.error('Error logging update:', error);
      throw error;
    }
  }

  async createActionItem(actionData) {
    try {
      const { data, error } = await this.client
        .from('action_items')
        .insert({
          task: actionData.task,
          project_id: actionData.project_id || null,
          assigned_to: actionData.assigned_to || null,
          due_date: actionData.due_date || null,
          priority: actionData.priority || 'medium',
          status: 'todo',
          created_from_update_id: actionData.created_from_update_id || null
        })
        .select()
        .single();

      if (error) throw error;

      logger.info(`✅ Action item created: ${data.id}`);
      return data;
    } catch (error) {
      logger.error('Error creating action item:', error);
      throw error;
    }
  }

  async getStaleProjects(daysThreshold = 3) {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .lt('last_update', thresholdDate.toISOString())
        .order('last_update', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting stale projects:', error);
      return [];
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
