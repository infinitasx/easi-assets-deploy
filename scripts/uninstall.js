const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')

const cwd = process.cwd()
if (cwd.indexOf('node_modules') >= 0) {
  const appRoot = path.normalize(cwd.slice(0, cwd.lastIndexOf('node_modules')))
  const pkgPath = path.join(appRoot, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath).toString('utf-8'))

  // delete script
  if (pkg.hasOwnProperty('scripts')) {
    if (pkg.scripts.hasOwnProperty('easi-assets-deploy')) {
      delete pkg.scripts['easi-assets-deploy']
    }
  }

  // delete config
  if (pkg.hasOwnProperty('easiAssetsDeployConfig')) {
    delete pkg.easiAssetsDeployConfig
  }

  // save package.json
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

  // delete .easi.yaml
  const yamlPath = path.join(appRoot, '.easi.yaml')
  if (fs.existsSync(yamlPath)) {
    rimraf.sync(yamlPath)
  }

  // delete .github
  const githubPath = path.join(appRoot, '.github')
  rimraf.sync(githubPath)
}
