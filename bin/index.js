#!/usr/bin/env node
const argv = require('yargs-parser')(process.argv)
const deploy = require('../lib/index')

console.log(argv)

const { backendBranch } = argv

if (!backendBranch) {
  throw new Error('Backend branch name is required.')
}

deploy(backendBranch)
