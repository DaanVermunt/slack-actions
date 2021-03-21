import * as core from '@actions/core'
import * as github from '@actions/github'

const run = async () => {
    const actionType = core.getInput('action-type');
    const botOAuthSecret = core.getInput('bot-oauth-secret');

    const githubToken = core.getInput('github-token');
    const payload = github.context.payload
    const octo = github.getOctokit(githubToken)

    const prNum = process.env.GITHUB_REF.split('/')[2] // refs/pull/134/merge

    const getBranchOptions = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: parseInt(prNum),
    }
    console.log(getBranchOptions)
    const branch = await octo.pulls.get(getBranchOptions)

    switch (actionType) {
        case 'PR_OPEN':
            console.log(`create channel ${branch}`)
            console.log(JSON.stringify(branch))
            break
        case 'PR_CLOSED':
            console.log(`remove/archive channel ${branch}`)
            console.log(JSON.stringify(branch))
            break
        default:
            console.log(`FAIL`)
            core.setFailed('Unknown slack action')
    }
}

run()
    .then(() => core.setOutput('my_feelings', 'YEAH'))
    .catch((error) => core.setFailed(error.message))