import * as core from '@actions/core'
import * as github from '@actions/github'

try {
    const actionType = core.getInput('action-type');
    const botOAuthSecret = core.getInput('bot-oauth-secret');

    const githubToken = core.getInput('github-token');
    const payload = github.context.payload
    const octo = github.getOctokit(githubToken)

    const prNum = process.env.GITHUB_REF.split('/')[2] // refs/pull/134/merge

    const branch = octo.pulls.get({
        owner: payload.repository.owner.name,
        repo: payload.repository.full_name,
        pull_number: parseInt(prNum),
    })

    switch (actionType) {
        case 'PR_OPEN':
            console.log(`create channel ${branch}`)
            console.log(JSON.stringify(branch))
            break
        case 'PR_CLOSE':
            console.log(`remove/archive channel ${branch}`)
            break
        default:
            console.log(`FAIL`)
            core.setFailed('Unknown slack action')
    }

} catch (error) {
    core.setFailed(error.message)
}