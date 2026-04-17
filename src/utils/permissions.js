// src/utils/permissions.js

function isAdmin(member) {
  return member.permissions.has('Administrator') ||
    member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

function isStaff(member) {
  return isAdmin(member) ||
    member.roles.cache.has(process.env.STAFF_ROLE_ID);
}

function isBooster(member) {
  return isStaff(member) ||
    member.roles.cache.has(process.env.BOOSTER_ROLE_ID);
}

function requireAdmin(member) {
  if (!isAdmin(member)) throw new Error('❌ You need **Administrator** permissions to use this command.');
}

function requireStaff(member) {
  if (!isStaff(member)) throw new Error('❌ You need **Staff** role to use this command.');
}

function requireBooster(member) {
  if (!isBooster(member)) throw new Error('❌ You need **Booster** role to use this command.');
}

module.exports = { isAdmin, isStaff, isBooster, requireAdmin, requireStaff, requireBooster };
