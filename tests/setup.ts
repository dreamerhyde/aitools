// Disable chalk colors for stable assertion output
process.env.FORCE_COLOR = '0';
process.env.NO_COLOR = '1';
// Prevent auto-update checks during tests
process.env.NO_UPDATE_CHECK = '1';
process.env.CI = '1';
