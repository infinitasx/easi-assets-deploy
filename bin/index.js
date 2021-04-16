#!/usr/bin/env node
const argv = require('yargs-parser')(process.argv)
const deploy = require('../lib/index')

console.log(argv)

const {
  env,
  backendBranch
} = argv

if (!env || !backendBranch) {
  throw new Error('Backend branch name is required.')
}

deploy(env, backendBranch)
