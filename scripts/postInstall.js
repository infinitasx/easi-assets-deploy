const fs = require('fs')
const path = require('path')
const os =require('os')
const YAML = require('js-yaml')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')

function exposeScript (pkgObj) {
  if (!pkgObj.hasOwnProperty('scripts')) {
    pkgObj.scripts = {}
  }

  if (!pkgObj.scripts.hasOwnProperty('easi-assets-deploy')) {
    pkgObj.scripts['easi-assets-deploy'] = 'easi-assets-deploy'
  }
}

function exposeConfig (pkgObj) {
  if (!pkgObj.hasOwnProperty('easiAssetsDeployConfig')) {
    pkgObj.easiAssetsDeployConfig = {
      backend: {
        projectName: '',
        repositoryUrl: '',
        templateDir: '',
      },
      assetsFilePattern: '*.html', // One of ['.', '*.html']
    }
  }
}

const cwd = process.cwd()
if (cwd.indexOf('node_modules') >= 0) {
  const appRoot = path.normalize(cwd.slice(0, cwd.lastIndexOf('node_modules')))
  // save package.json
  const pkgPath = path.join(appRoot, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath).toString('utf-8'))
  exposeScript(pkg)
  exposeConfig(pkg)
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

  // save .easi.yaml
  const easiYAMLPath = path.join(appRoot, '.easi.yaml')
  // 删除已有配置
  rimraf.sync(easiYAMLPath)
  const easiYAMLContent = YAML.dump({
    group: 'fe',
    name: pkg.name,
    build: 'yarn install --pure-lockfile && yarn easi-assets-deploy --env ${profile} --version ${version} --versionBuild ${version_build}',
    artifacts: [{
      destination: 'append-to-notification',
      artifact: './devops-notification'
    }]
  }, {
    lineWidth: -1,
    noCompatMode: true,
  })
  fs.writeFileSync(easiYAMLPath, easiYAMLContent)

  // 生成 Github Actions 配置
  const githubDir = path.join(appRoot, '.github')
  const workflowsDir = path.join(githubDir, 'workflows')
  mkdirp.sync(workflowsDir)
  // 删除已有配置
  rimraf.sync(path.join(workflowsDir, '*.yaml'))

  // 测试环境配置
  const testingYAMLPath = path.join(workflowsDir, 'testing.yaml')
  const testingYAMLContent = YAML.dump({
    name: '测试环境',
    on: { push: { tags: ['v*'] } },
    jobs: {
      build: {
        'runs-on': ['self-hosted', 'linux', 'x64', 'jp'],
        steps: [{
          uses: 'actions/checkout@v2'
        }, {
          name: 'build',
          env: {
            REPO_ACCESS_TOKEN: '${{ secrets.REPO_ACCESS_TOKEN }}',
          },
          run: 'cmdb build',
        }]
      }
    },
  }, {
    noCompatMode: true,
  })
  fs.writeFileSync(testingYAMLPath, testingYAMLContent)

  // 生产环境配置
  const productionYAMLPath = path.join(workflowsDir, 'production.yaml')
  const productionYAMLContent = YAML.dump({
    name: '生产环境',
    on: { release: { types: ['created'] } },
    jobs: {
      build: {
        'runs-on': ['self-hosted', 'linux', 'x64', 'jp'],
        steps: [{
          uses: 'actions/checkout@v2'
        }, {
          name: '发布到生产环境',
          env: {
            EASI_PROFILE: 'production',
            REPO_ACCESS_TOKEN: '${{ secrets.REPO_ACCESS_TOKEN }}',
          },
          run: 'cmdb build',
        }],
      }
    },
  }, {
    noCompatMode: true,
  })
  fs.writeFileSync(productionYAMLPath, productionYAMLContent)

  // CHANGELOG.md
  const changelogPath = path.join(appRoot, 'CHANGELOG.md')
  if (!fs.existsSync(changelogPath)) {
    fs.writeFileSync(
      changelogPath,
      [
        '# 变更日志',
        '本项目的所有更改都将记录在此文件中。',
        '本文件格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) ，' +
        '并且遵循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html) 。',
        os.EOL
      ].join(os.EOL + os.EOL))
  }
}
