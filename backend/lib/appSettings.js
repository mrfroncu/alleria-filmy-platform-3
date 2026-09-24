const { EMAIL_TEMPLATE_DEFAULTS } = require('./email');
const { WEBHOOK_ALLOWED_HOSTS } = require('./notify');
const { discordRolesConfigSource, getDiscordRoleSetting, getTsBotNickname, getTsSetting, tsConfigSource } = require('./tsConfig');
const { getLimit, getSetting } = require('./settings');

// ============ APP SETTINGS API (dev only) ============
const TS3_DELIVERY_VALUES = ['pm', 'poke', 'both'];
const GDPR_REGION_VALUES = ['off', 'eu', 'brazil'];

function settingsPayload() {
  return {
    webhook_domain_restriction: getSetting('webhook_domain_restriction', '1') === '1',
    webhook_allowed_hosts: WEBHOOK_ALLOWED_HOSTS,
    limit_display_name: getLimit('limit_display_name'),
    limit_bio: getLimit('limit_bio'),
    limit_comment: getLimit('limit_comment'),
    ts3_code_delivery: getSetting('ts3_code_delivery', 'pm'),
    videos_per_page: parseInt(getSetting('videos_per_page', '12'), 10) || 12,
    grid_columns: parseInt(getSetting('grid_columns', '3'), 10) || 3,
    grid_card_min_width: parseInt(getSetting('grid_card_min_width', '300'), 10) || 300,
    infinite_scroll: getSetting('infinite_scroll', '0') === '1',
    logs_per_page: parseInt(getSetting('logs_per_page', '50'), 10) || 50,
    iframe_embed_enabled: getSetting('iframe_embed_enabled', '0') === '1',
    iframe_allowed_origins: getSetting('iframe_allowed_origins', '').split(',').map(o => o.trim()).filter(Boolean),
    show_top_bar: getSetting('show_top_bar', '1') === '1',
    allow_custom_avatars: getSetting('allow_custom_avatars', '0') === '1',
    youtube_custom_player: getSetting('youtube_custom_player', '0') === '1',
    gdpr_region: getSetting('gdpr_region', 'off'),

    // SMTP — dev-only payload, so the raw password is returned here same as ts3/ts6 passwords below.
    smtp_host: getSetting('smtp_host', ''),
    smtp_port: getSetting('smtp_port', '587'),
    smtp_secure: getSetting('smtp_secure', '0') === '1',
    smtp_user: getSetting('smtp_user', ''),
    smtp_password: getSetting('smtp_password', ''),
    smtp_from: getSetting('smtp_from', ''),

    // Sitewide default email templates (content only — see wrapEmailHtml for the fixed design).
    email_template_new_video: getSetting('email_template_new_video', EMAIL_TEMPLATE_DEFAULTS.new_video),
    email_template_gdpr_notify: getSetting('email_template_gdpr_notify', EMAIL_TEMPLATE_DEFAULTS.gdpr_notify),
    email_template_gdpr_result_export: getSetting('email_template_gdpr_result_export', EMAIL_TEMPLATE_DEFAULTS.gdpr_result_export),
    email_template_gdpr_result_deletion: getSetting('email_template_gdpr_result_deletion', EMAIL_TEMPLATE_DEFAULTS.gdpr_result_deletion),

    // Login config — source flags are .env-only (boot-time, no panel override; see tsConfigSource/
    // discordRolesConfigSource). The fields below always report the *effective* value, whichever
    // source is currently active, so the panel can show something sensible either way.
    ts_config_source: tsConfigSource(),
    ts6_host: getTsSetting('ts6_host', process.env.TS6_HOST || process.env.TS_SERVER_HOST || ''),
    ts6_port: getTsSetting('ts6_port', process.env.TS6_QUERY_PORT || process.env.TS_API_PORT || '10080'),
    ts6_username: getTsSetting('ts6_username', process.env.TS6_USERNAME || process.env.TS_USERNAME || 'serveradmin'),
    ts6_password: getTsSetting('ts6_password', process.env.TS6_PASSWORD || process.env.TS_PASSWORD || ''),
    ts6_api_key: getTsSetting('ts6_api_key', process.env.TS6_API_KEY || process.env.TS_API_KEY || ''),
    ts6_server_id: getTsSetting('ts6_server_id', process.env.TS6_SERVER_ID || process.env.TS_SERVER_ID || '1'),
    ts6_member_group_id: getTsSetting('ts6_member_group_id', process.env.TS6_MEMBER_GROUP_ID || process.env.TS_MEMBER_GROUP_ID || ''),
    ts6_admin_group_id: getTsSetting('ts6_admin_group_id', process.env.TS6_ADMIN_GROUP_ID || process.env.TS_ADMIN_GROUP_ID || ''),
    ts3_host: getTsSetting('ts3_host', process.env.TS3_HOST || ''),
    ts3_port: getTsSetting('ts3_port', process.env.TS3_PORT || '10011'),
    ts3_username: getTsSetting('ts3_username', process.env.TS3_USERNAME || 'serveradmin'),
    ts3_password: getTsSetting('ts3_password', process.env.TS3_PASSWORD || ''),
    ts3_server_id: getTsSetting('ts3_server_id', process.env.TS3_SERVER_ID || '1'),
    ts3_member_group_id: getTsSetting('ts3_member_group_id', process.env.TS3_MEMBER_GROUP_ID || ''),
    ts3_admin_group_id: getTsSetting('ts3_admin_group_id', process.env.TS3_ADMIN_GROUP_ID || ''),
    ts_bot_nickname: getTsBotNickname(),

    discord_roles_config_source: discordRolesConfigSource(),
    discord_member_role_id: getDiscordRoleSetting('discord_member_role_id', process.env.DISCORD_MEMBER_ROLE_ID || ''),
    discord_admin_role_id: getDiscordRoleSetting('discord_admin_role_id', process.env.DISCORD_ADMIN_ROLE_ID || ''),
  };
}

module.exports = { TS3_DELIVERY_VALUES, GDPR_REGION_VALUES, settingsPayload };
