const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const reportTemplates = require('../reports/templates');

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

  // ============================================
  // PROJECT OPERATIONS (Multi-Context)
  // ============================================

  async upsertProject(projectData) {
    try {
      logger.info(`Upserting project: ${projectData.name} (${projectData.context_type || 'unknown'})`);

      // Check if project exists
      const existing = await this.getProjectByName(projectData.name);

      if (existing && projectData.context_type && existing.context_type !== projectData.context_type) {
        // Phase transition detected
        logger.info(`Phase transition: ${existing.context_type} → ${projectData.context_type}`);
      }

      const projectPayload = {
        name: projectData.name,
        context_type: projectData.context_type || existing?.context_type || 'negotiation',
        location: projectData.location || projectData.name,
        status: projectData.status || existing?.status || 'active',
        pic: projectData.pic || existing?.pic || 'Eka',
        priority: projectData.priority || existing?.priority || 'medium',
        data: { ...(existing?.data || {}), ...(projectData.data || {}) }, // Merge data
        next_action: projectData.next_action || existing?.next_action || null,
        deadline: projectData.deadline || existing?.deadline || null,
        tags: projectData.tags || existing?.tags || [],
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
      };

      let data, error;

      if (existing) {
        // UPDATE existing project
        const result = await this.client
          .from('projects')
          .update(projectPayload)
          .eq('id', existing.id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // INSERT new project
        const result = await this.client
          .from('projects')
          .insert(projectPayload)
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      logger.info(`✅ Project ${existing ? 'updated' : 'created'}: ${data.id} [${data.context_type.toUpperCase()}]`);
      return data;
    } catch (error) {
      logger.error('Error upserting project:', error);
      throw error;
    }
  }

  async getProjectByName(name) {
    try {
      // Single project per name - no context filter needed
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .ilike('name', `%${name}%`)
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Error getting project ${name}:`, error);
      return null;
    }
  }

  async getProjectsByContext(contextType) {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .eq('context_type', contextType)
        .order('priority', { ascending: true })
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error(`Error getting projects for context ${contextType}:`, error);
      return [];
    }
  }

  async getAllProjectsGroupedByContext() {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .order('context_type', { ascending: true })
        .order('priority', { ascending: true })
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Group by context_type
      const grouped = {
        negotiation: [],
        pre_opening: [],
        partnership: [],
        venture: []
      };

      (data || []).forEach(project => {
        if (grouped[project.context_type]) {
          grouped[project.context_type].push(project);
        }
      });

      return grouped;
    } catch (error) {
      logger.error('Error getting projects grouped by context:', error);
      return { negotiation: [], pre_opening: [], partnership: [], venture: [] };
    }
  }

  async getAllProjects() {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting all projects:', error);
      return [];
    }
  }

  async getRecentProjects(limit = 5) {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error(`Error getting recent projects:`, error);
      return [];
    }
  }

  // ============================================
  // RECAP / REPORTING
  // ============================================

  async generateRecap() {
    try {
      const projectsByContext = await this.getAllProjectsGroupedByContext();

      // Check if any projects exist
      const totalProjects = Object.values(projectsByContext).reduce((sum, projects) => sum + projects.length, 0);

      if (totalProjects === 0) {
        return reportTemplates.noProjects();
      }

      // Generate full recap using template
      return reportTemplates.generateFullRecap(projectsByContext);
    } catch (error) {
      logger.error('Error generating recap:', error);
      return '⚠️ Error generating recap. Try again.';
    }
  }

  async getProjectStatus(projectName) {
    try {
      // Single project per name - no context filter needed
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .ilike('name', `%${projectName}%`)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return reportTemplates.projectNotFound(projectName);
      }

      // Generate report based on current context type (phase)
      switch (data.context_type) {
        case 'negotiation':
          return reportTemplates.negotiationReport(data);
        case 'pre_opening':
          return reportTemplates.preOpeningReport(data);
        case 'partnership':
          return reportTemplates.partnershipReport(data);
        case 'venture':
          return reportTemplates.ventureReport(data);
        default:
          return `📊 ${data.name}\nStatus: ${data.status}\nNext: ${data.next_action || 'TBD'}`;
      }
    } catch (error) {
      logger.error(`Error getting project status for ${projectName}:`, error);
      return '⚠️ Error getting project status.';
    }
  }

  // ============================================
  // UPDATES LOG
  // ============================================

  async logUpdate(updateData) {
    try {
      logger.info(`Logging update for project: ${updateData.project_id}`);

      const { data, error } = await this.client
        .from('updates_log')
        .insert({
          project_id: updateData.project_id,
          update_type: updateData.update_type || 'data_update',
          summary: updateData.summary || updateData.update_text,
          old_value: updateData.old_value || null,
          new_value: updateData.new_value || null,
          author: updateData.author,
          whatsapp_message_id: updateData.whatsapp_message_id || null
        })
        .select()
        .single();

      if (error) throw error;

      // Update last_message_at timestamp
      await this.client
        .from('projects')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', updateData.project_id);

      logger.info(`✅ Update logged: ${data.id}`);
      return data;
    } catch (error) {
      logger.error('Error logging update:', error);
      throw error;
    }
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  async getStaleProjects(daysThreshold = 5) {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .lt('last_message_at', thresholdDate.toISOString())
        .order('last_message_at', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting stale projects:', error);
      return [];
    }
  }

  async getUrgentProjects(daysAhead = 3) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      const futureStr = futureDate.toISOString().split('T')[0];

      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .gte('deadline', today)
        .lte('deadline', futureStr)
        .order('deadline', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting urgent projects:', error);
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
