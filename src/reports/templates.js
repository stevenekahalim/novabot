const logger = require('../utils/logger');

/**
 * Report Templates for Nova
 * Multi-context reporting system
 */

class ReportTemplates {

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('id-ID', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatTime(date) {
    if (!date) return '';
    return new Date(date).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(amount) {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('id-ID').format(amount);
  }

  // ============================================
  // CONTEXT-SPECIFIC STATUS REPORTS
  // ============================================

  negotiationReport(project) {
    const data = project.data || {};

    let report = `🤝 *${project.name} - Negotiation*\n\n`;

    if (data.offer_details) {
      report += `*OFFER:*\n${data.offer_details}\n`;
    }

    if (data.rental_rate) {
      report += `Rate: Rp ${this.formatCurrency(data.rental_rate)}/month\n`;
    }

    report += `\n*TERMS:*\n`;
    report += `${data.payment_terms || 'Being discussed'}\n`;

    if (data.grace_period_months !== undefined) {
      report += `Grace period: ${data.grace_period_months} months\n`;
    }

    report += `\n*STATUS:* ${project.status || 'In Discussion'}\n`;

    if (project.deadline) {
      report += `*DECIDE BY:* ${this.formatDate(project.deadline)}\n`;
    }

    report += `\n*NEXT:* ${project.next_action || 'Awaiting decision'}`;

    return report.trim();
  }

  preOpeningReport(project) {
    const data = project.data || {};

    // Check if we have actual progress data, or if user wants full planning template
    const hasChecklist = data.checklist && data.checklist.length > 0;

    if (!hasChecklist) {
      // Full pre-opening planning template
      return this.preOpeningPlanningTemplate(project);
    }

    // Progress tracking for project with checklist
    let report = `🚀 *${project.name} - Pre-Opening*\n\n`;

    // Calculate progress
    const totalItems = data.checklist.length;
    const doneItems = data.checklist.filter(item => item.status === 'done');
    const progressPercent = Math.round((doneItems.length / totalItems) * 100);

    report += `*PROGRESS:* ${doneItems.length}/${totalItems} items (${progressPercent}%)\n`;

    // Determine current phase based on what's done
    const phaseProgress = this.calculatePhaseProgress(data.checklist);
    const currentPhase = this.determineCurrentPhase(phaseProgress);
    report += `*CURRENT PHASE:* ${currentPhase}\n\n`;

    // Show progress by phase
    report += `📊 *PHASE STATUS:*\n`;
    Object.entries(phaseProgress).forEach(([phase, stats]) => {
      const phasePercent = Math.round((stats.done / stats.total) * 100);
      const emoji = phasePercent === 100 ? '✅' : phasePercent > 0 ? '🔄' : '⏳';
      report += `${emoji} ${phase}: ${stats.done}/${stats.total} (${phasePercent}%)\n`;
    });

    // Recently completed items
    if (doneItems.length > 0) {
      report += `\n✅ *RECENTLY COMPLETED:*\n`;
      doneItems.slice(-3).reverse().forEach(item => {
        report += `• ${item.item}\n`;
      });
    }

    // Next priority items (pending items from current phase)
    const pendingItems = data.checklist.filter(item => item.status === 'pending');
    if (pendingItems.length > 0) {
      report += `\n⏳ *UP NEXT:*\n`;
      pendingItems.slice(0, 3).forEach(item => {
        report += `• ${item.item}\n`;
      });
    }

    // Timeline
    if (data.opening_target) {
      report += `\n⏰ *TARGET OPENING:* ${this.formatDate(data.opening_target)}\n`;
    }

    // Blockers
    if (data.blockers && data.blockers.length > 0) {
      report += `🚨 *BLOCKERS:* ${data.blockers.join(', ')}\n`;
    }

    if (project.next_action) {
      report += `\n*NEXT ACTION:* ${project.next_action}`;
    }

    return report.trim();
  }

  calculatePhaseProgress(checklist) {
    // Simplified 3-phase tracking
    const phases = {
      'Legal': { total: 0, done: 0 },
      'Design': { total: 0, done: 0 },
      'Construction': { total: 0, done: 0 }
    };

    checklist.forEach(item => {
      const phase = item.phase || 'Legal';
      if (phases[phase]) {
        phases[phase].total++;
        if (item.status === 'done') {
          phases[phase].done++;
        }
      }
    });

    return phases;
  }

  determineCurrentPhase(phaseProgress) {
    // Simplified phase detection
    if (phaseProgress['Legal'].done < phaseProgress['Legal'].total) {
      return 'Legal Setup';
    }
    if (phaseProgress['Design'].done < phaseProgress['Design'].total) {
      return 'Design Phase';
    }
    if (phaseProgress['Construction'].done < phaseProgress['Construction'].total) {
      return 'Construction';
    }
    return 'Ready to Open!';
  }

  preOpeningPlanningTemplate(project) {
    const data = project.data || {};

    let report = `🚀 *PRE-OPENING: ${project.name}*\n\n`;

    report += `📋 *MVP CHECKLIST* (5 Critical Items)\n\n`;

    report += `*LEGAL SETUP:*\n`;
    report += `☐ Sign rental agreement\n`;
    report += `☐ Create PT/CV (Akta pendirian)\n`;
    report += `☐ Open bank account\n\n`;

    report += `*DESIGN:*\n`;
    report += `☐ Hire architect/designer\n\n`;

    report += `*CONSTRUCTION:*\n`;
    report += `☐ Select contractor\n\n`;

    report += `💡 *HOW TO UPDATE:*\n`;
    report += `Just say: "PT done, bank account done"\n`;
    report += `Nova will track it automatically.\n\n`;

    if (data.opening_target) {
      report += `⏰ *TARGET:* ${this.formatDate(data.opening_target)}\n`;
    }

    if (data.budget) {
      report += `💰 *BUDGET:* Rp ${this.formatCurrency(data.budget)}\n`;
    }

    return report.trim();
  }

  partnershipReport(project) {
    const data = project.data || {};

    let report = `🤝 *${project.name} - Partnership*\n\n`;

    if (data.partner_name) {
      report += `*PARTNER:* ${data.partner_name}\n`;
    }

    if (data.deal_type) {
      report += `*TYPE:* ${data.deal_type}\n`;
    }

    if (data.agreed_terms && data.agreed_terms.length > 0) {
      report += `\n*AGREED TERMS ✅*\n`;
      data.agreed_terms.slice(0, 3).forEach(term => {
        report += `• ${term}\n`;
      });
    }

    if (data.pending_issues && data.pending_issues.length > 0) {
      report += `\n*PENDING ⏳*\n`;
      data.pending_issues.slice(0, 3).forEach(issue => {
        report += `• ${issue}\n`;
      });
    }

    report += `\n*STATUS:* ${project.status || 'Active'}\n`;
    report += `*NEXT:* ${project.next_action || 'Follow up'}`;

    return report.trim();
  }

  ventureReport(project) {
    const data = project.data || {};

    let report = `💡 *${project.name}*\n\n`;

    if (data.current_phase) {
      report += `*PHASE:* ${data.current_phase}\n`;
    }

    if (data.business_model) {
      report += `*MODEL:* ${data.business_model}\n`;
    }

    if (data.milestones && data.milestones.length > 0) {
      report += `\n*MILESTONES:*\n`;
      data.milestones.forEach(milestone => {
        const emoji = milestone.status === 'done' ? '✅' :
                     milestone.status === 'in_progress' ? '🔄' : '⏳';
        const dateStr = milestone.date ? ` (${milestone.date})` : '';
        report += `${emoji} ${milestone.milestone}${dateStr}\n`;
      });
    }

    report += `\n*THIS WEEK:*\n${project.next_action || 'Set next milestone'}`;

    return report.trim();
  }

  // ============================================
  // COMPREHENSIVE RECAP
  // ============================================

  generateFullRecap(projectsByContext) {
    let report = `📊 *APEX PROJECT STATUS*\n`;
    report += `${this.formatDate(new Date())}\n\n`;

    // Count totals
    const totalProjects = Object.values(projectsByContext).reduce((sum, projects) => sum + projects.length, 0);

    // NEGOTIATIONS
    if (projectsByContext.negotiation && projectsByContext.negotiation.length > 0) {
      report += `🤝 *NEGOTIATIONS (${projectsByContext.negotiation.length})*\n`;
      projectsByContext.negotiation.forEach(p => {
        const status = p.data?.payment_terms || p.status || 'In discussion';
        report += `• ${p.name}: ${status}\n`;
      });
      report += `\n`;
    }

    // PRE-OPENING
    if (projectsByContext.pre_opening && projectsByContext.pre_opening.length > 0) {
      report += `🚀 *PRE-OPENING (${projectsByContext.pre_opening.length})*\n`;
      projectsByContext.pre_opening.forEach(p => {
        const progress = p.data?.construction_progress || 0;
        const target = p.data?.opening_date || p.data?.opening_target;
        const targetStr = target ? ` (opens ${this.formatDate(target)})` : '';
        report += `• ${p.name}: ${progress}%${targetStr}\n`;
      });
      report += `\n`;
    }

    // PARTNERSHIPS
    if (projectsByContext.partnership && projectsByContext.partnership.length > 0) {
      report += `💼 *PARTNERSHIPS (${projectsByContext.partnership.length})*\n`;
      projectsByContext.partnership.forEach(p => {
        const partner = p.data?.partner_name || 'Partner';
        const status = p.status || 'Active';
        report += `• ${p.name}: ${status}\n`;
      });
      report += `\n`;
    }

    // VENTURES
    if (projectsByContext.venture && projectsByContext.venture.length > 0) {
      report += `💡 *VENTURES (${projectsByContext.venture.length})*\n`;
      projectsByContext.venture.forEach(p => {
        const phase = p.data?.current_phase || p.status || 'In Progress';
        report += `• ${p.name}: ${phase}\n`;
      });
      report += `\n`;
    }

    report += `📈 *TOTAL: ${totalProjects} active projects*\n\n`;
    report += `_Type "status [project name]" for details_`;

    return report.trim();
  }

  // ============================================
  // CONFIRMATION TEMPLATES
  // ============================================

  confirmSave(project, changes, contextType) {
    let message = `✅ *[${contextType.toUpperCase()}] ${project.name}*\n`;

    if (Array.isArray(changes)) {
      changes.forEach(change => {
        message += `• ${change}\n`;
      });
    } else {
      message += `• ${changes}\n`;
    }

    message += `\nSaved: ${this.formatTime(new Date())}`;

    return message.trim();
  }

  confirmFile(project, filename, category, contextType) {
    return `📎 *[${contextType.toUpperCase()}] File saved*
• ${filename}
• For: ${project.name}
• Type: ${category}

Filed: ${this.formatTime(new Date())}`.trim();
  }

  // ============================================
  // ERROR MESSAGES
  // ============================================

  noProjects() {
    return `📝 No projects tracked yet.\n\nSend an update to create your first project!`;
  }

  projectNotFound(projectName) {
    return `🤔 "${projectName}" belum ada di database.\n\nTypo? Or project baru?`;
  }

  clarificationNeeded() {
    return `Project mana? Sebut nama project untuk status check.\n\nOr type "recap" untuk overview semua.`;
  }
}

module.exports = new ReportTemplates();
