#!/usr/bin/env node
/**
 * Root wrapper to run the fake price simulator from the backend directory.
 * Usage:
 *   node simulator.js                # Runs every 10s
 *   node simulator.js --once         # Runs a single tick and exits
 *   node simulator.js --seed-history # Pre-populates 7 days of realistic baseline data
 */
import './src/simulator.js';
