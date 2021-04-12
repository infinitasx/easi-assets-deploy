const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const mkdirp = require('mkdirp')
const chalk = require('chalk')

const cwd = process.cwd()
const BACKEND_DEPLOY_REL_PATH = '../deploy/b'
const BACKEND_DEPLOY_ABS_PATH = path.resolve(cwd, BACKEND_DEPLOY_REL_PATH)
const FRONTEND_DEPLOY_REL_PATH = '../deploy/f'
const FRONTEND_DEPLOY_ABS_PATH = path.resolve(cwd, FRONTEND_DEPLOY_REL_PATH)
const {
  name: frontProjectName,
  easiAssetsDeployConfig: deployConfig,
} = require(path.resolve(cwd, './package.json'))

module.exports = function (backendBranchName) {
  if (!backendBranchName) {
    throw Error(`easi-assets-deploy: backendBranchName is required.`)
  }

  let branchPrefix = backendBranchName.substring(0, backendBranchName.indexOf('-')).toLowerCase()
  backendBranchName = `${branchPrefix}/${backendBranchName}`

  /**
   * 后端检出流程
   */
  let {
    backendProjectName,
    backendRepositoryUrl,
    backendTemplateDir,
  } = deployConfig

  if (!backendProjectName || !backendRepositoryUrl || !backendTemplateDir) {
    throw new Error('easi-assets-deploy: The backend misconfiguration.')
  }

  const {
    REPO_ACCESS_TOKEN
  } = process.env
  let urlObj = new URL(backendRepositoryUrl)
  urlObj.username = REPO_ACCESS_TOKEN
  backendRepositoryUrl = urlObj.toString()
  const backendDeployDir = path.resolve(BACKEND_DEPLOY_ABS_PATH, backendProjectName)

  // 检查后端项目目录是否存在。如果不存在，创建目录后 clone 代码
  if (!fs.existsSync(backendDeployDir)) {
    mkdirp.sync(backendDeployDir)
    execSync(`git clone --branch master ${backendRepositoryUrl} ${backendDeployDir}`, {
      cwd: backendDeployDir,
      stdio: [0, 1, 2]
    })
  }

  // 判断后端远程仓库是否存在要发布分支。如果不存在直接退出
  const backendBranchRemote = execSync(
    `git ls-remote --heads ${backendRepositoryUrl} ${backendBranchName}`,
    { cwd: backendDeployDir }
  ).toString('utf-8').trim()
  if (backendBranchRemote === '') {
    throw new Error('easi-assets-deploy: The backend remote branch does not exist.')
  } else {
    execSync(`git pull ${backendRepositoryUrl}`, { cwd: backendDeployDir, stdio: [0, 1, 2] })
  }

  // 检出后端对应分支
  const backendBranchLocal = execSync(
    `git branch --list ${backendBranchName}`,
    { cwd: backendDeployDir }
  ).toString('utf-8').trim()
  if (backendBranchLocal === '') {
    // 如果后端不存在本地对应分支，直接创建
    execSync(
      `git branch --no-track ${backendBranchName} refs/remotes/origin/${backendBranchName}`,
      { cwd: backendDeployDir, stdio: [0, 1, 2] },
    )
    execSync(
      `git branch --set-upstream-to=origin/${backendBranchName} ${backendBranchName}`,
      { cwd: backendDeployDir, stdio: [0, 1, 2] },
    )
  }
  execSync(`git checkout ${backendBranchName}`, { cwd: backendDeployDir, stdio: [0, 1, 2] })


  // 前端构建流程
  const frontendDeployDir = path.resolve(FRONTEND_DEPLOY_ABS_PATH, frontProjectName)
  const frontendExecOptions = { cwd, stdio: [0, 1, 2] }
  // const frontendRepositoryUrl = execSync('git config --get remote.origin.url', { cwd }).toString('utf-8').trim()

  // 判断前端远程仓库是否存在要发布分支。如果不存在直接退出
  // const frontendBranchRemote = execSync(
  //   `git ls-remote --heads ${frontendRepositoryUrl} ${frontendBranchName}`,
  //   { cwd }
  // ).toString('utf-8').trim()
  // if (frontendBranchRemote === '') {
  //   throw new Error('easi-assets-deploy: The frontend remote branch does not exist.')
  // } else {
  //   execSync(`git pull`, frontendExecOptions)
  // }

  // 检查前端对应分支，如果不存在本地对应分支，直接创建
  // const frontendBranchLocal = execSync(
  //   `git branch --list ${frontendBranchName}`,
  //   { cwd }
  // ).toString('utf-8').trim()
  // if (frontendBranchLocal === '') {
  //   execSync(
  //     `git branch --no-track ${frontendBranchName} refs/remotes/origin/${frontendBranchName}`,
  //     frontendExecOptions,
  //   )
  //   execSync(
  //     `git branch --set-upstream-to=origin/${frontendBranchName} ${frontendBranchName}`,
  //     frontendExecOptions,
  //   )
  // }

  // execSync(`git checkout ${frontendBranchName}`, frontendExecOptions)

  // 检查前端项目部署目录是否存在。如果不存在创建一个
  if (!fs.existsSync(frontendDeployDir)) {
    mkdirp.sync(frontendDeployDir)
  }

  // build 前端代码
  // execSync('yarn', frontendExecOptions)
  execSync('yarn build', frontendExecOptions)
  // 复制 dist 代码
  execSync(`cp -a dist/. ${frontendDeployDir}`, frontendExecOptions)
  // 复制 html 代码
  execSync(`cp -a ${frontendDeployDir}/*.html ${backendDeployDir}/${backendTemplateDir}`)


  // 同步前端代码到 S3
  execSync(`aws s3 sync ${FRONTEND_DEPLOY_REL_PATH} s3://static.easiglobal.com/`, frontendExecOptions)

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
      `git ${fakedGithubUser} commit -m "chore(${frontProjectName}): build(#${frontendRev})"`,
      { cwd: backendDeployDir, stdio: [0, 1, 2] }
    )
    execSync(`git push --repo=${backendRepositoryUrl}`, { cwd: backendDeployDir, stdio: [0, 1, 2] })
  }

  console.log(
    chalk.green(
      `${String.fromCodePoint(10024)}  easi-assets-deploy: ${frontProjectName} deploy complete.`
    )
  )
}

