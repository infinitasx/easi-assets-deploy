#!/usr/bin/env node
const argv = require('yargs-parser')(process.argv)
const deploy = require('../lib/index')

console.log(argv)

const {
  env,
  version,
  versionBuild: backendBranchName
} = argv

deploy(env, version, backendBranchName)
