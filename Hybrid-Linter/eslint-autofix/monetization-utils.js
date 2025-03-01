// monetization-utils.js
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { getProjectContext } from "./project-context.js";
import { config } from "./state.js";

/**
 * Available plan levels for Hybrid Linter
 */
const PLANS = {
  FREE: {
    name: "Free",
    features: ["basic_linting", "simple_patterns"],
    limits: {
      monthlyFixes: 100,
      filesPerRepo: 500,
      teamSize: 1,
    },
    price: 0,
  },

  PRO: {
    name: "Professional",
    features: [
      "basic_linting",
      "simple_patterns",
      "ai_analysis",
      "cross_file",
      "rollback",
      "dashboard",
    ],
    limits: {
      monthlyFixes: 1000,
      filesPerRepo: 5000,
      teamSize: 1,
    },
    price: 19, // $ per month
  },

  TEAM: {
    name: "Team",
    features: [
      "basic_linting",
      "simple_patterns",
      "ai_analysis",
      "cross_file",
      "rollback",
      "dashboard",
      "team_profiles",
      "usage_analytics",
      "api_access",
    ],
    limits: {
      monthlyFixes: 5000,
      filesPerRepo: 20000,
      teamSize: 10,
      concurrentProjects: 5,
    },
    price: 49, // $ per user per month
  },

  ENTERPRISE: {
    name: "Enterprise",
    features: [
      "basic_linting",
      "simple_patterns",
      "ai_analysis",
      "cross_file",
      "rollback",
      "dashboard",
      "team_profiles",
      "usage_analytics",
      "api_access",
      "custom_languages",
      "priority_support",
      "sso",
      "custom_rules",
      "unlimited_projects",
    ],
    limits: {
      monthlyFixes: "unlimited",
      filesPerRepo: "unlimited",
      teamSize: "unlimited",
      concurrentProjects: "unlimited",
    },
    price: "Contact Sales",
  },
};

/**
 * Feature flags that correspond to plan levels
 */
const FEATURE_FLAGS = {
  basic_linting: {
    name: "Basic Linting",
    description: "Essential linting and simple pattern-based fixes",
    configKey: null, // Always enabled
    minPlan: "FREE",
  },

  simple_patterns: {
    name: "Pattern-based Fixes",
    description: "Fix common issues with regular expression patterns",
    configKey: null, // Always enabled
    minPlan: "FREE",
  },

  ai_analysis: {
    name: "AI Analysis",
    description: "Advanced variable analysis using AI",
    configKey: "USE_AI_FOR_UNUSED_VARS",
    minPlan: "PRO",
  },

  cross_file: {
    name: "Cross-file Analysis",
    description: "Analyze dependencies and impacts across files",
    configKey: "CROSS_FILE_ANALYSIS",
    minPlan: "PRO",
  },

  rollback: {
    name: "Rollback & History",
    description: "Revert changes and maintain fix history",
    configKey: "ENABLE_ROLLBACK",
    minPlan: "PRO",
  },

  dashboard: {
    name: "Metrics Dashboard",
    description: "Visual reporting and ROI tracking",
    configKey: "ENABLE_DASHBOARD",
    minPlan: "PRO",
  },

  team_profiles: {
    name: "Team Profiles",
    description: "Team-specific configuration profiles",
    configKey: "TEAM_FEATURES",
    minPlan: "TEAM",
  },

  usage_analytics: {
    name: "Usage Analytics",
    description: "Detailed analytics across team members",
    configKey: "ENABLE_ANALYTICS",
    minPlan: "TEAM",
  },

  api_access: {
    name: "API Access",
    description: "Access via API for CI/CD integration",
    configKey: "ENABLE_API",
    minPlan: "TEAM",
  },

  custom_languages: {
    name: "Custom Languages",
    description: "Support for additional programming languages",
    configKey: "ENABLE_CUSTOM_LANGUAGES",
    minPlan: "ENTERPRISE",
  },

  priority_support: {
    name: "Priority Support",
    description: "Direct support channel with guaranteed response times",
    configKey: "PRIORITY_SUPPORT",
    minPlan: "ENTERPRISE",
  },

  sso: {
    name: "Single Sign-On",
    description: "Enterprise SSO integration",
    configKey: "ENABLE_SSO",
    minPlan: "ENTERPRISE",
  },

  custom_rules: {
    name: "Custom Rules Engine",
    description: "Create custom linting and fixing rules",
    configKey: "ENABLE_CUSTOM_RULES",
    minPlan: "ENTERPRISE",
  },

  unlimited_projects: {
    name: "Unlimited Projects",
    description: "No limit on concurrent projects",
    configKey: null, // Controlled via plan limits
    minPlan: "ENTERPRISE",
  },
};

/**
 * Check if a feature is available in the current plan
 * @param {string} featureKey - Feature key to check
 * @returns {boolean} - Whether the feature is available
 */
export function isFeatureAvailable(featureKey) {
  // If the feature doesn't exist, it's not available
  if (!FEATURE_FLAGS[featureKey]) {
    return false;
  }

  // Get the current plan
  const currentPlan = getCurrentPlan();

  // Check if the feature is in the current plan
  return PLANS[currentPlan].features.includes(featureKey);
}

/**
 * Get the current plan level based on license information
 * @returns {string} - Plan level (FREE, PRO, TEAM, ENTERPRISE)
 */
export function getCurrentPlan() {
  if (!config.LICENSE_KEY) {
    return "FREE";
  }

  if (config.LICENSE_KEY.startsWith("pro-")) {
    return "PRO";
  }

  if (config.LICENSE_KEY.startsWith("team-")) {
    return "TEAM";
  }

  if (config.LICENSE_KEY.startsWith("enterprise-")) {
    return "ENTERPRISE";
  }

  // Invalid license, default to FREE
  return "FREE";
}

/**
 * Check if a feature limit has been reached
 * @param {string} limitKey - The limit to check (e.g., 'monthlyFixes')
 * @returns {boolean} - Whether the limit has been reached
 */
export async function isLimitReached(limitKey) {
  const currentPlan = getCurrentPlan();
  const planLimits = PLANS[currentPlan].limits;

  // If the plan has unlimited use of this feature, limit is never reached
  if (planLimits[limitKey] === "unlimited") {
    return false;
  }

  const projectContext = await getProjectContext();

  switch (limitKey) {
    case "monthlyFixes":
      // Count fixes this month
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      const monthlyFixCount = (projectContext.fixHistory || []).filter(
        (fix) => {
          const fixDate = new Date(fix.timestamp);
          return (
            fixDate.getMonth() === currentMonth &&
            fixDate.getFullYear() === currentYear
          );
        }
      ).length;

      return monthlyFixCount >= planLimits.monthlyFixes;

    case "filesPerRepo":
      // Count files in the project
      return projectContext.files.size >= planLimits.filesPerRepo;

    case "teamSize":
      // Count unique users
      const uniqueUsers = new Set(
        (projectContext.usageHistory || [])
          .map((record) => record.userId)
          .filter(Boolean)
      );

      return uniqueUsers.size > planLimits.teamSize;

    case "concurrentProjects":
      // This would need to be tracked at a higher level in a real implementation
      return false;

    default:
      return false;
  }
}

/**
 * Initialize feature flags based on license
 */
export async function initializeFeatureFlags() {
  const currentPlan = getCurrentPlan();
  const availableFeatures = PLANS[currentPlan].features;

  // Enable or disable features based on plan
  for (const [featureKey, feature] of Object.entries(FEATURE_FLAGS)) {
    if (feature.configKey) {
      // Set config flag based on whether the feature is available in current plan
      config[feature.configKey] = availableFeatures.includes(featureKey);
    }
  }

  // Set overall premium flag
  config.PREMIUM_FEATURES = currentPlan !== "FREE";

  // Set team features flag
  config.TEAM_FEATURES = ["TEAM", "ENTERPRISE"].includes(currentPlan);

  // Load plan limits
  config.PLAN_LIMITS = PLANS[currentPlan].limits;

  return {
    plan: currentPlan,
    features: availableFeatures,
    isPremium: config.PREMIUM_FEATURES,
    hasTeamFeatures: config.TEAM_FEATURES,
  };
}

/**
 * Generate an upgrade message for a premium feature
 * @param {string} featureKey - The feature being requested
 * @returns {string} - Upgrade message
 */
export function getUpgradeMessage(featureKey) {
  const feature = FEATURE_FLAGS[featureKey];

  if (!feature) {
    return `This feature requires an upgraded plan. Please upgrade to continue.`;
  }

  const currentPlan = getCurrentPlan();
  const requiredPlan = feature.minPlan;

  // No upgrade needed if current plan already has this feature
  if (isFeatureAvailable(featureKey)) {
    return null;
  }

  // Determine the best plan to upgrade to
  let upgradePlan;

  switch (currentPlan) {
    case "FREE":
      upgradePlan =
        requiredPlan === "PRO"
          ? "PRO"
          : requiredPlan === "TEAM"
          ? "TEAM"
          : "ENTERPRISE";
      break;
    case "PRO":
      upgradePlan = requiredPlan === "TEAM" ? "TEAM" : "ENTERPRISE";
      break;
    case "TEAM":
      upgradePlan = "ENTERPRISE";
      break;
    default:
      return null; // Enterprise has all features
  }

  const price = PLANS[upgradePlan].price;
  const priceInfo = typeof price === "number" ? `$${price}/month` : price;

  return `"${feature.name}" is available in the ${PLANS[upgradePlan].name} plan (${priceInfo}).

${feature.description}

To unlock this feature, please upgrade your plan at https://hybridlinter.io/upgrade`;
}

/**
 * Show a prompt when a limit is reached
 * @param {string} limitKey - The limit that was reached
 */
export async function showLimitReachedPrompt(limitKey) {
  const currentPlan = getCurrentPlan();
  const planLimits = PLANS[currentPlan].limits;

  if (!planLimits[limitKey] || planLimits[limitKey] === "unlimited") {
    return null; // No limit for this feature in the current plan
  }

  let message;
  let upgradePlan;

  // Determine next tier plan
  switch (currentPlan) {
    case "FREE":
      upgradePlan = "PRO";
      break;
    case "PRO":
      upgradePlan = "TEAM";
      break;
    case "TEAM":
      upgradePlan = "ENTERPRISE";
      break;
    default:
      return null; // Enterprise has no limits
  }

  // Create limit-specific messages
  switch (limitKey) {
    case "monthlyFixes":
      message = `You've reached your ${planLimits[limitKey]} monthly fixes limit on the ${PLANS[currentPlan].name} plan.`;
      break;
    case "filesPerRepo":
      message = `You've reached your ${planLimits[limitKey]} files per repository limit on the ${PLANS[currentPlan].name} plan.`;
      break;
    case "teamSize":
      message = `You've reached your ${planLimits[limitKey]} team members limit on the ${PLANS[currentPlan].name} plan.`;
      break;
    case "concurrentProjects":
      message = `You've reached your ${planLimits[limitKey]} concurrent projects limit on the ${PLANS[currentPlan].name} plan.`;
      break;
    default:
      message = `You've reached a limit on your ${PLANS[currentPlan].name} plan.`;
  }

  const nextPlanLimits = PLANS[upgradePlan].limits[limitKey];
  const nextPlanInfo =
    nextPlanLimits === "unlimited"
      ? "unlimited usage"
      : `${nextPlanLimits} ${limitKey
          .replace(/([A-Z])/g, " $1")
          .toLowerCase()}`;

  const price = PLANS[upgradePlan].price;
  const priceInfo = typeof price === "number" ? `$${price}/month` : price;

  return `${message}

Upgrade to the ${PLANS[upgradePlan].name} plan (${priceInfo}) to get ${nextPlanInfo}.

Visit https://hybridlinter.io/upgrade to upgrade your plan.`;
}

/**
 * Create a subscription for a user or team
 * This is a placeholder - in a real app, this would integrate with a payment provider
 */
export async function createSubscription(planKey, userId, teamId = null) {
  try {
    if (!PLANS[planKey]) {
      throw new Error(`Invalid plan: ${planKey}`);
    }

    const subscriptionData = {
      plan: planKey,
      userId,
      teamId,
      startDate: new Date(),
      status: "active",
      features: PLANS[planKey].features,
      limits: PLANS[planKey].limits,
    };

    // In a real implementation, this would call a payment API
    // For now, we'll just create a mock subscription

    // Generate a mock license key
    const licenseKey = teamId
      ? `${planKey.toLowerCase()}-${teamId}-${Date.now()}`
      : `${planKey.toLowerCase()}-${userId}-${Date.now()}`;

    // Add license key to the subscription
    subscriptionData.licenseKey = licenseKey;

    // Save mock subscription data
    const subscriptionsDir = path.join(config.OUTPUT_DIR, "subscriptions");
    if (!fs.existsSync(subscriptionsDir)) {
      fs.mkdirSync(subscriptionsDir, { recursive: true });
    }

    const filePath = path.join(subscriptionsDir, `${licenseKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(subscriptionData, null, 2));

    return {
      success: true,
      subscription: subscriptionData,
    };
  } catch (error) {
    console.error(chalk.red(`Error creating subscription: ${error.message}`));
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get available plans information
 */
export function getPlansInfo() {
  return {
    plans: PLANS,
    features: FEATURE_FLAGS,
    currentPlan: getCurrentPlan(),
  };
}

/**
 * Create an enterprise plan quote
 */
export function createEnterpriseQuote(companyInfo, requirements) {
  // This is just a placeholder - in a real app, this would send information
  // to a sales team or CRM system

  const quoteData = {
    companyInfo,
    requirements,
    quoteId: `QUOTE-${Date.now()}`,
    expiresIn: "30 days",
    contactEmail: "sales@hybridlinter.io",
    generated: new Date(),
  };

  // Save the quote data
  const quotesDir = path.join(config.OUTPUT_DIR, "quotes");
  if (!fs.existsSync(quotesDir)) {
    fs.mkdirSync(quotesDir, { recursive: true });
  }

  const filePath = path.join(quotesDir, `${quoteData.quoteId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(quoteData, null, 2));

  return {
    success: true,
    quoteId: quoteData.quoteId,
    message:
      "Thank you for your interest! Our sales team will contact you shortly with a customized quote.",
  };
}
