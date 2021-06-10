#!/usr/bin/env node
const argv = require('yargs-parser')(process.argv)
const deploy = require('../lib/index')

console.log(argv)

let {
  env,
  version,
  versionBuild: backendBranchName
} = argv

if (backendBranchName === true) {
  backendBranchName = undefined
}

deploy(env, version, backendBranchName)
