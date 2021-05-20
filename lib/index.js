const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const mkdirp = require('mkdirp')
const glob = require('glob')
const chalk = require('chalk')

const cwd = process.cwd()
const DEVOPS_NOTIFICATION_FILE_PATH = path.resolve(cwd, 'devops-notification')
const S3_BUCKETS = {
  production: 'static.easiglobal.com',
  testing: 'static.melbdelivery.com',
}
const ASSETS_CDN = {
  production: 'https://static.easiglobal.com',
  testing: 'https://static.melbdelivery.com',
}
const BACKEND_DEPLOY_REL_PATH = '../deploy/b'
const BACKEND_DEPLOY_ABS_PATH = path.resolve(cwd, BACKEND_DEPLOY_REL_PATH)
const FRONTEND_DEPLOY_REL_PATH = '../deploy/f'
const FRONTEND_DEPLOY_ABS_PATH = path.resolve(cwd, FRONTEND_DEPLOY_REL_PATH)
const {
  name: frontendProjectName,
  version: frontendProjectVersion,
  easiAssetsDeployConfig: deployConfig,
} = require(path.resolve(cwd, './package.json'))

module.exports = function (env='', version='', backendBranchName='') {
  if (!env) {
    throw Error(`easi-assets-deploy: env is required.`)
  }
  if (!version) {
    throw Error(`easi-assets-deploy: version is required.`)
  }

  const s3Bucket = S3_BUCKETS[env]
  const assetsCDN = ASSETS_CDN[env]
  if (!s3Bucket) {
    throw Error(`easi-assets-deploy: s3 bucket not found for ${env}.`)
  }
  if (!assetsCDN) {
    throw Error(`easi-assets-deploy: assets cdn not found for ${env}.`)
  }

  let {
    backend: {
      projectName: backendProjectName,
      repositoryUrl: backendRepositoryUrl,
      templateDir: backendTemplateDir,
    },
    assetsFilePattern,
    asLibrary,
  } = deployConfig
  const frontEndOnly = !backendProjectName && !backendRepositoryUrl && !backendTemplateDir
  const backendDeployDir = path.resolve(BACKEND_DEPLOY_ABS_PATH, backendProjectName)
  let frontendDeployDir = path.resolve(FRONTEND_DEPLOY_ABS_PATH, frontendProjectName)
  const frontendExecOptions = { cwd, stdio: [0, 1, 2] }

  // 作为独立库或 SDK 发布
  if (asLibrary) {
    frontendDeployDir = path.join(frontendDeployDir, frontendProjectVersion)
  }

  // 开始前端构建流程，检查前端项目部署目录是否存在。如果不存在创建一个
  if (!fs.existsSync(frontendDeployDir)) {
    mkdirp.sync(frontendDeployDir)
  }

  // build 前端代码
  execSync(`EASI_BUILD_ENV=${env} EASI_ASSETS_CDN=${assetsCDN} yarn build`, frontendExecOptions)
  // 复制 dist 代码
  execSync(`cp -a dist/. ${frontendDeployDir}`, frontendExecOptions)
  // 同步前端代码到 S3
  execSync(`aws s3 sync ${FRONTEND_DEPLOY_REL_PATH} s3://${s3Bucket}/`, frontendExecOptions)

  // 如果需要发布后端，则开始检出流程
  if (!frontEndOnly) {
    if (
      backendBranchName.startsWith('Release') ||
      backendBranchName.startsWith('Hotfix') ||
      backendBranchName.startsWith('Feature') ||
      backendBranchName.startsWith('Support')
    ) {
      let branchPrefix = backendBranchName.substring(0, backendBranchName.indexOf('-')).toLowerCase()
      backendBranchName = `${branchPrefix}/${backendBranchName}`
    }

    if (!backendProjectName || !backendRepositoryUrl || !backendTemplateDir) {
      throw new Error('easi-assets-deploy: The backend misconfiguration.')
    }

    /**
     * 后端检出流程
     */
    const { REPO_ACCESS_TOKEN } = process.env
    if (REPO_ACCESS_TOKEN) {
      let urlObj = new URL(backendRepositoryUrl)
      urlObj.username = REPO_ACCESS_TOKEN
      backendRepositoryUrl = urlObj.toString()
    }

    // 检查后端项目目录是否存在。如果不存在，创建目录后 clone 代码
    if (!fs.existsSync(backendDeployDir)) {
      mkdirp.sync(backendDeployDir)
      execSync(
        `git clone ${backendRepositoryUrl} ${backendDeployDir}`,
        { cwd: backendDeployDir, stdio: [0, 1, 2] }
      )
    }

    // 判断后端远程仓库是否存在要发布分支。如果不存在直接退出
    const backendBranchRemote = execSync(
      `git ls-remote --heads ${backendRepositoryUrl} ${backendBranchName}`,
      { cwd: backendDeployDir }
    ).toString('utf-8').trim()
    if (backendBranchRemote === '') {
      throw new Error(`easi-assets-deploy: The backend remote branch(${backendBranchName}) does not exist.`)
    } else {
      execSync(`git pull origin ${backendBranchName}`, { cwd: backendDeployDir, stdio: [0, 1, 2] })
    }

    // 检出后端对应分支
    const backendBranchLocal = execSync(
      `git branch --list ${backendBranchName}`,
      { cwd: backendDeployDir }
    ).toString('utf-8').trim()
    if (backendBranchLocal === '') {
      // 如果后端不存在本地对应分支，直接创建
      execSync(
        `git branch --no-track ${backendBranchName} origin/${backendBranchName}`,
        { cwd: backendDeployDir, stdio: [0, 1, 2] },
      )
      execSync(
        `git branch --set-upstream-to=origin/${backendBranchName} ${backendBranchName}`,
        { cwd: backendDeployDir, stdio: [0, 1, 2] },
      )
    }
    execSync(`git checkout ${backendBranchName}`, { cwd: backendDeployDir, stdio: [0, 1, 2] })

    // 复制 assets 文件
    if (assetsFilePattern === '.') {
      execSync(`cp -a ${frontendDeployDir}/${assetsFilePattern} ${backendDeployDir}/${backendTemplateDir}`)
    } else {
      let patterns = Array.isArray(assetsFilePattern) ? assetsFilePattern.slice() : [assetsFilePattern]
      for (let pattern of patterns) {
        const files = glob.sync(`**/${pattern}`, { cwd: frontendDeployDir })
        for (let file of files) {
          const absPath = path.join(frontendDeployDir, file)
          const fileDirName = path.dirname(file)
          const targetDirName = path.resolve(`${backendDeployDir}/${backendTemplateDir}`, fileDirName)
          if (!fs.existsSync(targetDirName)) {
            mkdirp.sync(targetDirName)
          }
          execSync(`cp -a ${absPath} ${targetDirName}`)
        }
      }
    }

    // 检查后端代码状态，如果有更改则提交
    const frontendRev = execSync(`git rev-parse --short HEAD`, { cwd }).toString('utf-8').trim()
    const backendBranchStatusLocal = execSync(
      'git status --porcelain',
      { cwd: backendDeployDir }
    ).toString('utf-8').trim()
    if (backendBranchStatusLocal !== '') {
      execSync(`git add .`, { cwd: backendDeployDir, stdio: [0, 1, 2] })

      const fakedGithubUser = `-c user.name='EASI FE-BOT' -c user.email=fe-bot@easi.com.au`
      execSync(
        `git ${fakedGithubUser} commit -m "chore(${frontendProjectName}): build(#${frontendRev})"`,
        { cwd: backendDeployDir, stdio: [0, 1, 2] }
      )
    }
    execSync(`git push origin ${backendBranchName}`, { cwd: backendDeployDir, stdio: [0, 1, 2] })
  }

  // 读取并保存变更日志到 devops_notification
  const changelogPath = path.resolve(cwd, './CHANGELOG.md')
  if (fs.existsSync(changelogPath)) {
    const fileContent = fs.readFileSync(changelogPath, 'utf-8')
    let captured = false
    let logs = []
    for (let line of fileContent.split(os.EOL)) {
      if (!captured && line.startsWith('## ')) {
        captured = true
        logs.push(line.substring(3))
        continue
      }

      if (captured && line.startsWith('### ')) {
        logs.push('')
        logs.push(line.substring(4))
      }

      if (captured && line.startsWith('- ')) {
        logs.push(`  · ${line.substring(2)}`)
      }

      if (captured && line.startsWith('## ')) {
        break
      }
    }
    if (logs.length > 0) {
      fs.writeFileSync(DEVOPS_NOTIFICATION_FILE_PATH, logs.join(os.EOL))
    }
  }

  const sparkles = String.fromCodePoint(10024)
  console.log(chalk.green(`${sparkles} easi-assets-deploy: ${frontendProjectName} deploy complete ${sparkles}`))
}

