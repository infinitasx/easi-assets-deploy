const fs = require('fs')
const path = require('path')
const YAML = require('js-yaml')
const mkdirp = require('mkdirp')

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
      backendProjectName: '',
      backendRepositoryUrl: '',
      backendTemplateDir: '',
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
  if (!fs.existsSync(easiYAMLPath)) {
    const easiYAMLContent = YAML.dump({
      group: 'fe',
      name: pkg.name,
      build: 'yarn && yarn easi-assets-deploy --backendBranch ${version_build}',
    }, {
      noCompatMode: true,
    })
    fs.writeFileSync(easiYAMLPath, easiYAMLContent)
  }

  // save .github/workflows/build.yaml
  const githubDir = path.join(appRoot, '.github')
  if (!fs.existsSync(githubDir)) {
    const workflowsDir = path.join(githubDir, 'workflows')
    const workflowsYAMLPath = path.join(workflowsDir, 'build.yaml')
    mkdirp.sync(workflowsDir)
    const workflowsYAMLContent = YAML.dump({
      name: 'BUILD',
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
    fs.writeFileSync(workflowsYAMLPath, workflowsYAMLContent)
  }
}
