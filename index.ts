import * as core from '@actions/core'

try {
    const actionType = core.getInput('action-type');
    const botOAuthSecret = core.getInput('bot-oauth-secret');
    const branch = process.env.GITHUB_REF.split('/').slice(2).join('/')

    switch (actionType) {
        case 'PR_OPEN':
            console.log(`${process.env.GITHUB_REF}`)
            console.log(`${process.env}`)
            console.log(`create channel ${branch}`)
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