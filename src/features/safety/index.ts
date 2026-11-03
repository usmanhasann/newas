/**
 * Safety feature — cross-system on-device safety utilities. Currently houses System 3 (private
 * threats toward another person). System 1's Circles on-device prescreen will join here in Phase 4.
 * System 2 (crisis) lives in @features/crisis.
 */
export { matchesPrivateThreatPrescreen } from './threatMatcher';
export { matchesSeverePrescreen } from './severePrescreen';
export { reportPrivateThreat, type PrivateThreatSource } from './api';
