#!/usr/bin/env node

const MIN = { major: 20, minor: 0, patch: 0 };

function parse(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version || "");
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compare(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

const current = parse(process.versions.node);

if (!current) {
  console.error("Unable to determine Node.js version (process.versions.node)");
  process.exit(1);
}

if (compare(current, MIN) < 0) {
  console.error(
    `Node.js ${MIN.major}.${MIN.minor}.${MIN.patch} or newer is required. Detected ${process.versions.node}.`
  );
  process.exit(1);
}

process.exit(0);
