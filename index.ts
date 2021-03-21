import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as moment from 'moment'

const run = async () => {
    const actionType = core.getInput('action-type');
    const botOAuthSecret = core.getInput('bot-oauth-secret');

    const githubToken = core.getInput('github-token');
    const payload = github.context.payload
    const octo = github.getOctokit(githubToken)

    const prNum = process.env.GITHUB_REF.split('/')[2] // refs/pull/134/merge

    const getPROptions = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: parseInt(prNum),
    }
    const PR = await octo.pulls.get(getPROptions)

    const base = PR.data.base.ref
    const head = PR.data.head.ref

    const date = moment().format('YY-MM-DD')

    const channelName = 'test_channel1' || `PR ${date}: ${head} -> ${base}`

    const slackClient = new WebClient(botOAuthSecret)

    switch (actionType) {
        case 'PR_OPEN':
            console.log(`create channel ${channelName}`)
            console.log(JSON.stringify(channelName))
            break
        case 'PR_CLOSED':
            console.log(`remove/archive channel ${channelName}`)
            const listChannelResponse = await slackClient.conversations.list()
            const channels = listChannelResponse.channels as {id: string, name: string}[]
            const channel = channels.find(ch => ch.name === channelName)
            await slackClient.conversations.archive({
                channel: channel.id
            })
            break
        default:
            console.log(`FAIL`)
            core.setFailed('Unknown slack action')
    }
}

run()
    .then(() => core.setOutput('my_feelings', 'YEAH'))
    .catch((error) => core.setFailed(error.message))