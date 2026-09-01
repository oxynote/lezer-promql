// Modifications Copyright 2026 Oxynote
//
// upstream runs this suite from the prometheus web/ui workspace, where
// ts-jest is hoisted into scope. Standalone there is no typescript to
// transform — the one suite is plain ESM javascript — so the preset is
// dropped rather than the toolchain pulled in to satisfy it.
/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
};
