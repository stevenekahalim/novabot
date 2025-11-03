const { Client } = require('@notionhq/client');
const logger = require('../utils/logger');

class NotionSync {
  constructor() {
    const notionToken = process.env.NOTION_TOKEN;
    const databaseId = process.env.NOTION_PROJECTS_DB_ID;

    if (!notionToken || !databaseId) {
      logger.warn('Notion credentials missing - sync disabled');
      this.enabled = false;
      return;
    }

    this.client = new Client({ auth: notionToken });
    this.databaseId = databaseId;
    this.enabled = true;
    this.syncQueue = [];
    this.lastSyncTime = Date.now();
    this.rateLimit = 3; // requests per second
  }

  async syncProject(projectData) {
    if (!this.enabled) {
      logger.debug('Notion sync disabled, skipping');
      return null;
    }

    try {
      // Check if page exists (by Supabase ID stored in Notion)
      const existing = await this.findPageBySupabaseId(projectData.id);

      if (existing) {
        // Update existing page
        return await this.updatePage(existing.id, projectData);
      } else {
        // Create new page
        return await this.createPage(projectData);
      }
    } catch (error) {
      logger.error('Error syncing to Notion:', error);
      return null;
    }
  }

  async findPageBySupabaseId(supabaseId) {
    try {
      const response = await this.client.databases.query({
        database_id: this.databaseId,
        filter: {
          property: 'Supabase ID',
          rich_text: {
            equals: supabaseId
          }
        }
      });

      return response.results[0] || null;
    } catch (error) {
      logger.error('Error finding Notion page:', error);
      return null;
    }
  }

  async createPage(projectData) {
    try {
      logger.info(`Creating Notion page for: ${projectData.name}`);

      const response = await this.client.pages.create({
        parent: { database_id: this.databaseId },
        properties: this.buildProperties(projectData)
      });

      logger.info(`✅ Notion page created: ${response.id}`);
      return response;
    } catch (error) {
      logger.error('Error creating Notion page:', error);
      throw error;
    }
  }

  async updatePage(pageId, projectData) {
    try {
      logger.info(`Updating Notion page: ${projectData.name}`);

      const response = await this.client.pages.update({
        page_id: pageId,
        properties: this.buildProperties(projectData)
      });

      logger.info(`✅ Notion page updated: ${pageId}`);
      return response;
    } catch (error) {
      logger.error('Error updating Notion page:', error);
      throw error;
    }
  }

  buildProperties(projectData) {
    const properties = {
      'Name': {
        title: [{ text: { content: projectData.name || 'Unnamed Project' } }]
      },
      'Supabase ID': {
        rich_text: [{ text: { content: projectData.id || '' } }]
      }
    };

    // Add optional fields if they exist
    if (projectData.location) {
      properties['Location'] = {
        select: { name: projectData.location }
      };
    }

    if (projectData.status) {
      properties['Status'] = {
        select: { name: this.formatStatus(projectData.status) }
      };
    }

    if (projectData.pic) {
      properties['PIC'] = {
        select: { name: projectData.pic }
      };
    }

    if (projectData.monthly_cost) {
      properties['Monthly Cost'] = {
        number: parseFloat(projectData.monthly_cost)
      };
    }

    if (projectData.last_update) {
      properties['Last Update'] = {
        date: { start: projectData.last_update }
      };
    }

    if (projectData.next_action) {
      properties['Next Action'] = {
        rich_text: [{ text: { content: projectData.next_action } }]
      };
    }

    return properties;
  }

  formatStatus(status) {
    // Convert database status to Notion-friendly format
    const statusMap = {
      'planning': 'Planning',
      'rental': 'Rental',
      'design': 'Design',
      'construction': 'Construction',
      'complete': 'Complete'
    };

    return statusMap[status] || status;
  }

  async batchSync(projects) {
    if (!this.enabled || projects.length === 0) return;

    logger.info(`Batch syncing ${projects.length} projects to Notion...`);

    for (const project of projects) {
      try {
        await this.syncProject(project);

        // Rate limiting: wait between requests
        await this.waitForRateLimit();
      } catch (error) {
        logger.error(`Failed to sync project ${project.name}:`, error);
      }
    }

    logger.info('Batch sync completed');
  }

  async waitForRateLimit() {
    const minDelay = 1000 / this.rateLimit; // milliseconds per request
    const elapsed = Date.now() - this.lastSyncTime;

    if (elapsed < minDelay) {
      await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
    }

    this.lastSyncTime = Date.now();
  }

  isEnabled() {
    return this.enabled;
  }
}

module.exports = NotionSync;
